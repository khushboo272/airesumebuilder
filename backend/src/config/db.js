const mongoose = require("mongoose");
const env = require("./env");

mongoose.set("strictQuery", true);

async function connectDB() {
    try {
        const conn = await mongoose.connect(env.mongoUri, {
            serverSelectionTimeoutMS: 10_000,
            family: 4,
        });
        console.log('MongoDB connected: ', conn.connection.host, '/', conn.connection.name);
    } catch (err) {
        console.error("MongoDB initial connection error:", err.message);
    }

    mongoose.connection.on("error", (err) => {
        console.error("MongoDB error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected");
    });
}
module.exports = { connectDB };