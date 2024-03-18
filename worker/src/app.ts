import express from "express";
import cors from "cors";

import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import { consumer } from "./redis/consumer";

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

consumer.on("failed", (job, err) => {
  console.log(`Job failed with error ${err}`);
});

consumer.on("completed", (job) => {
  console.log(`Job completed with result ${job.returnvalue}`);
});

export default app;
