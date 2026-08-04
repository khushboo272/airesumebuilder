# 🐳 Docker, Jenkins & CI/CD Deployment Guide

This guide provides instructions for containerizing, building, and deploying the **AI Resume Builder** application using Docker, Docker Compose, Jenkins, and GitHub Actions.

---

## 📁 Architecture Overview

- **Backend Container**: Node.js 20 Express API running on port `5000`.
- **Frontend Container**: Multi-stage build (Vite + React) served by **Nginx** on port `80`, proxying `/api` requests to the Backend container.
- **Database Container**: MongoDB 7 image with persistent volume `mongo-data`.
- **Jenkins Pipeline**: Automates code linting, Docker image building, integration testing, and deployment.
- **GitHub Actions**: Provides automated PR testing and container build validation.

---

## 🚀 Quick Start with Docker Compose

### 1. Production Mode
To launch the full production stack locally:

```bash
# Clone and navigate to root directory
cd airesumebuilder

# Copy & set your environment variables
# Backend environment settings
export GEMINI_API_KEY="your_actual_gemini_api_key"
export JWT_SECRET="your_secure_jwt_secret"

# Build and start containers in detached mode
docker-compose up --build -d
```

Access the application:
- **Frontend**: `http://localhost` (or `http://localhost:80`)
- **Backend API**: `http://localhost:5000/api/health`
- **MongoDB**: `localhost:27017`

To check logs and container status:
```bash
docker-compose ps
docker-compose logs -f backend
```

To stop and remove containers:
```bash
docker-compose down
```

---

### 2. Local Development Mode (Hot Reloading)

For containerized development with hot-reload enabled:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

Access services:
- **Frontend Dev Server**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

---

## 🛠 Jenkins Pipeline Setup

### Prerequisites
1. **Jenkins Server**: Installed with Docker Pipeline & Git plugins.
2. **Permissions**: Jenkins user added to the `docker` group (`sudo usermod -aG docker jenkins`).

### Creating the Pipeline Job
1. In Jenkins dashboard, click **New Item**.
2. Enter name `airesumebuilder-pipeline` and select **Pipeline**.
3. Under **Build Triggers**, enable **GitHub hook trigger for GITScm polling** (or Poll SCM).
4. Under **Pipeline**:
   - **Definition**: `Pipeline script from SCM`
   - **SCM**: `Git`
   - **Repository URL**: `https://github.com/your-org/airesumebuilder.git`
   - **Branch Specifier**: `*/main`
   - **Script Path**: `Jenkinsfile`
5. Click **Save** and trigger a **Build Now**.

---

## 🤖 GitHub Actions Workflow

The repository includes a `.github/workflows/ci-cd.yml` file that automatically:
1. Runs code quality and dependency checks on every Pull Request to `main`.
2. Builds Docker images for backend & frontend services using Docker Buildx.
3. Tests container stack integration using `docker compose up`.

---

## 🔐 Environment Variables Summary

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Backend service port | `5000` |
| `MONGODB_URI` | Mongo connection string | `mongodb://mongodb:27017/airesumebuilder` |
| `NODE_ENV` | Environment mode | `production` |
| `JWT_SECRET` | Secret key for JWT auth signing | Set in production secrets |
| `GEMINI_API_KEY` | Google Gemini AI API key | Set in production secrets |

---

## 🧪 Verification & Health Monitoring

To verify service status manually:
```bash
# Check Backend Health
curl -i http://localhost:5000/api/health

# Expected Response:
# HTTP/1.1 200 OK
# {"status":"ok","timestamp":"..."}
```
