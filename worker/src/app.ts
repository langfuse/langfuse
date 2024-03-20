import express from "express";
import cors from "cors";

import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import { evalJobCreator, evalJobExecutor } from "./redis/consumer";

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

console.log("Eval Job Creator started", evalJobCreator.isRunning());

console.log("Eval Job Executor started", evalJobExecutor.isRunning());

evalJobCreator.on("failed", (job, err) => {
  console.log(`Job failed with error ${err}`);
});

evalJobExecutor.on("completed", (job) => {
  console.log(`Job completed with error ${job.failedReason}`);
});

evalJobCreator.on("failed", (job, err) => {
  console.log(`Job failed with error ${err}`);
});

evalJobCreator.on("completed", (job) => {
  console.log(`Job completed with result ${job.returnvalue}`);
});

export default app;
