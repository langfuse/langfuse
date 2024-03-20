import express from "express";
import cors from "cors";

import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import { worker } from "./redis/consumer";

const app = express();

app.use(cors());
app.use(express.json());
app.get<{}, MessageResponse>("/", (req, res) => {
  res.json({
    message: "🦄🌈✨👋🌎🌍🌏✨🌈🦄",
  });
});

app.use("/api/v1", api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

console.log("Worker started", worker.isPaused(), worker.isRunning());

worker.on("active", (jobId) => {
  console.log(`Job ${jobId} is active`);
});

worker.on("failed", (job, err) => {
  console.log(`Job failed with error ${err}`);
});

worker.on("progress", (job, progress) => {
  console.log(`Job ${job.id} reported progress: ${progress}`);
});

worker.on("completed", (job) => {
  console.log(`Job completed with result ${job.returnvalue}`);
});

export default app;
