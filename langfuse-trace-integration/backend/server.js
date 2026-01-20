require("dotenv").config();
const express = require("express");
const cors = require("cors");
const LangFuseClient = require("./langfuse-client");

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// LangFuse 客户端配置
const langFuseConfig = {
  baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
  apiKey: process.env.LANGFUSE_API_KEY,
  projectId: process.env.LANGFUSE_PROJECT_ID,
};

const langFuseClient = new LangFuseClient(langFuseConfig);

// 健康检查端点
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 获取 Trace 列表
app.get("/api/traces", async (req, res) => {
  try {
    const params = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      searchQuery: req.query.searchQuery,
      userId: req.query.userId,
      name: req.query.name,
      tags: req.query.tags ? req.query.tags.split(",") : undefined,
      fromTimestamp: req.query.fromTimestamp,
      toTimestamp: req.query.toTimestamp,
    };

    const data = await langFuseClient.getTraces(params);
    res.json(data);
  } catch (error) {
    console.error("Error fetching traces:", error);
    res.status(500).json({
      error: "Failed to fetch traces",
      message: error.message,
    });
  }
});

// 获取单个 Trace 详情
app.get("/api/traces/:traceId", async (req, res) => {
  try {
    const { traceId } = req.params;
    const data = await langFuseClient.getTrace(traceId);
    res.json(data);
  } catch (error) {
    console.error("Error fetching trace:", error);
    res.status(500).json({
      error: "Failed to fetch trace",
      message: error.message,
    });
  }
});

// 获取 Trace 指标
app.get("/api/metrics/traces", async (req, res) => {
  try {
    const params = {
      fromTimestamp: req.query.fromTimestamp,
      toTimestamp: req.query.toTimestamp,
      userId: req.query.userId,
      name: req.query.name,
      tags: req.query.tags ? req.query.tags.split(",") : undefined,
    };

    const data = await langFuseClient.getTraceMetrics(params);
    res.json(data);
  } catch (error) {
    console.error("Error fetching trace metrics:", error);
    res.status(500).json({
      error: "Failed to fetch trace metrics",
      message: error.message,
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 LangFuse Integration Server running on port ${PORT}`);
  console.log(`📊 LangFuse Base URL: ${langFuseConfig.baseUrl}`);
  console.log(`🔑 API Key configured: ${langFuseConfig.apiKey ? "Yes" : "No"}`);
  console.log(`📁 Project ID: ${langFuseConfig.projectId}`);
});
