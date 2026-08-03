const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { uploadPdf } = require("../middleware/upload");

const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");

const { extractText } = require("../services/pdfService");
const { parseResume: parseStructured } = require("../services/structuredParser");
const Analysis = require("../models/Analysis");

const router = express.Router();
router.use(requireAuth);

const objectIdSchema = z
    .string()
    .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

const idParam = z.object({ id: objectIdSchema });

async function loadOwnedResume(req) {
    const resume = await Resume.findOne({
        _id: req.params.id,
        userId: req.user._id,
    });
    if (!resume) throw ApiError.notFound("Resume not found");
    return resume;
}

async function loadVersion(resumeId, versionId) {
    const version = await ResumeVersion.findOne({ _id: versionId, resumeId });
    if (!version) throw ApiError.notFound("Version not found");
    return version;
}

// Upload & create resume
router.post(
    "/",
    uploadPdf("file"),
    asyncHandler(async (req, res) => {
        const { text, meta } = await extractText(req.file.buffer);
        const parsedSections = await parseStructured(text);

        const title =
            (req.body.title || "").trim() ||
            req.file.originalname.replace(/\.pdf$/i, "") ||
            "Untitled Resume";

        const resume = await Resume.create({
            userId: req.user._id,
            title,
            latestVersionNumber: 1,
        });

        const version = await ResumeVersion.create({
            resumeId: resume._id,
            versionNumber: 1,
            label: "V1",
            rawText: text,
            parsedSections,
            sourceType: "upload",
            parentVersionId: null,
        });

        resume.currentVersionId = version._id;
        await resume.save();

        res.status(201).json({ resume, version, meta });
    })
);

// Get all user resumes
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const resumes = await Resume.find({ userId: req.user._id })
            .sort({ updatedAt: -1 })
            .lean();
        res.json({ resumes });
    })
);

// Get single resume with version history
router.get(
    "/:id",
    validate(idParam, "params"),
    asyncHandler(async (req, res) => {
        const resume = await loadOwnedResume(req);
        const versions = await ResumeVersion.find({ resumeId: resume._id })
            .sort({ versionNumber: 1 })
            .select("-rawText")
            .lean();
        res.json({ resume, versions });
    })
);

// Get specific version of a resume
router.get(
    "/:id/versions/:versionId",
    validate(
        z.object({ id: objectIdSchema, versionId: objectIdSchema }),
        "params"
    ),
    asyncHandler(async (req, res) => {
        const resume = await loadOwnedResume(req);
        const version = await loadVersion(resume._id, req.params.versionId);
        res.json({ version });
    })
);

// Delete resume
router.delete(
    "/:id",
    validate(idParam, "params"),
    asyncHandler(async (req, res) => {
        const resume = await loadOwnedResume(req);
        await ResumeVersion.deleteMany({ resumeId: resume._id });
        await Analysis.deleteMany({ resumeId: resume._id });
        await resume.deleteOne();
        res.json({ ok: true });
    })
);

const { analyzeResume } = require("../services/geminiService");

const analyzeBody = z.object({
    versionId: objectIdSchema.optional(),
    targetRole: z.string().trim().max(120).optional(),
});

// Analyze resume / version
router.post(
    "/:id/analyze",
    validate(idParam, "params"),
    validate(analyzeBody),
    asyncHandler(async (req, res) => {
        const resume = await loadOwnedResume(req);

        const versionId = req.body.versionId || resume.currentVersionId;
        if (!versionId) throw ApiError.badRequest("No version to analyze");
        const version = await loadVersion(resume._id, versionId);

        const { analysis, model, promptTokens, responseTokens } =
            await analyzeResume({
                rawText: version.rawText,
                targetRole: req.body.targetRole,
            });

        const saved = await Analysis.create({
            userId: req.user._id,
            resumeId: resume._id,
            versionId: version._id,
            atsScore: analysis.atsScore,
            scoreBreakdown: analysis.scoreBreakdown,
            issues: analysis.issues,
            strengths: analysis.strengths,
            bulletRewrites: analysis.bulletRewrites,
            keywordsPresent: analysis.keywordsPresent,
            keywordsMissing: analysis.keywordsMissing,
            summary: analysis.summary,
            model,
            promptTokens,
            responseTokens,
        });

        version.latestAnalysisId = saved._id;
        await version.save();

        res.status(201).json({ analysis: saved });
    })
);

// Get all analyses for a resume
router.get(
    "/:id/analyses",
    validate(idParam, "params"),
    asyncHandler(async (req, res) => {
        const resume = await loadOwnedResume(req);
        const analyses = await Analysis.find({ resumeId: resume._id })
            .sort({ createdAt: -1 })
            .lean();
        res.json({ analyses });
    })
);

// Get analysis for specific version
router.get(
    "/:id/versions/:versionId/analysis",
    validate(
        z.object({ id: objectIdSchema, versionId: objectIdSchema }),
        "params"
    ),
    asyncHandler(async (req, res) => {
        const resume = await loadOwnedResume(req);
        const version = await loadVersion(resume._id, req.params.versionId);
        const analysis = await Analysis.findOne({
            resumeId: resume._id,
            versionId: version._id,
        })
            .sort({ createdAt: -1 })
            .lean();
        res.json({ analysis: analysis || null });
    })
);

module.exports = router;