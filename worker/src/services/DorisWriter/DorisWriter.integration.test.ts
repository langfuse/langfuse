import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DorisClient } from "@langfuse/shared/src/server";
import { DorisWriter, TableName } from "./index";

describe("DorisWriter Integration Tests", () => {
  let dorisClient: DorisClient;
  let writer: DorisWriter;

  beforeEach(async () => {
    // 初始化 Doris 客户端，先连接到默认数据库进行初始化
    dorisClient = new DorisClient({
      feHttpUrl: "http://10.16.10.6:8630",
      feQueryPort: 9630,
      database: "information_schema", // 先连接系统数据库
      username: "root",
      password: "123456",
      timeout: 30000
    });

    // 1. 创建 langfuse 数据库（如果不存在）
    try {
      await dorisClient.query("CREATE DATABASE IF NOT EXISTS langfuse");
      console.log("✓ langfuse 数据库已创建或存在");
    } catch (error) {
      console.warn("创建数据库失败:", error);
      throw error;
    }

    // 2. 切换到 langfuse 数据库
    await dorisClient.close();
    dorisClient = new DorisClient({
      feHttpUrl: "http://10.16.10.6:8630",
      feQueryPort: 9630,
      database: "langfuse",
      username: "root",
      password: "123456",
      timeout: 30000
    });

    // 3. 创建测试需要的表
    await createTestTables();

    // 4. 获取 DorisWriter 实例
    writer = DorisWriter.getInstance(dorisClient);
  });

  afterEach(async () => {
    try {
      // 清理测试数据
      await dorisClient.query("TRUNCATE TABLE traces");
      await dorisClient.query("TRUNCATE TABLE scores");
      await dorisClient.query("TRUNCATE TABLE observations");
      console.log("✓ 测试数据已清理");
    } catch (error) {
      console.warn("清理测试数据失败:", error);
    }
    
    // 关闭连接
    await writer.shutdown();
    await dorisClient.close();
    
    // 重置单例实例
    (DorisWriter as any).instance = null;
  });

  async function createTestTables() {
    const tables = [
      {
        name: "traces",
        sql: `
          CREATE TABLE IF NOT EXISTS traces (
            id VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            metadata JSON,
            tags ARRAY<VARCHAR(255)>,
            timestamp BIGINT,
            public BOOLEAN,
            bookmarked BOOLEAN,
            environment VARCHAR(255),
            project_id VARCHAR(255),
            is_deleted TINYINT,
            created_at BIGINT,
            updated_at BIGINT,
            event_ts BIGINT
          )
          DUPLICATE KEY(id)
          DISTRIBUTED BY HASH(id) BUCKETS 1
          PROPERTIES (
            "replication_allocation" = "tag.location.default: 1"
          )
        `
      },
      {
        name: "scores",
        sql: `
          CREATE TABLE IF NOT EXISTS scores (
            id VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            metadata JSON,
            timestamp BIGINT,
            source VARCHAR(255),
            environment VARCHAR(255),
            project_id VARCHAR(255),
            is_deleted TINYINT,
            created_at BIGINT,
            updated_at BIGINT,
            event_ts BIGINT,
            value DOUBLE,
            data_type VARCHAR(50),
            trace_id VARCHAR(255)
          )
          DUPLICATE KEY(id)
          DISTRIBUTED BY HASH(id) BUCKETS 1
          PROPERTIES (
            "replication_allocation" = "tag.location.default: 1"
          )
        `
      },
      {
        name: "observations",
        sql: `
          CREATE TABLE IF NOT EXISTS observations (
            id VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            type VARCHAR(50),
            metadata JSON,
            environment VARCHAR(255),
            project_id VARCHAR(255),
            is_deleted TINYINT,
            created_at BIGINT,
            updated_at BIGINT,
            start_time BIGINT,
            event_ts BIGINT,
            trace_id VARCHAR(255),
            provided_usage_details JSON,
            provided_cost_details JSON,
            usage_details JSON,
            cost_details JSON
          )
          DUPLICATE KEY(id)
          DISTRIBUTED BY HASH(id) BUCKETS 1
          PROPERTIES (
            "replication_allocation" = "tag.location.default: 1"
          )
        `
      }
    ];

    for (const table of tables) {
      try {
        await dorisClient.query(table.sql);
        console.log(`✓ 表 ${table.name} 已创建或存在`);
      } catch (error) {
        console.error(`创建表 ${table.name} 失败:`, error);
        throw error;
      }
    }
  }

  it("should connect to Doris and verify basic operations", async () => {
    // 1. 测试健康检查
    const isHealthy = await dorisClient.healthCheck();
    expect(isHealthy).toBe(true);
    console.log("✓ Doris 健康检查通过");

    // 2. 测试基本查询
    const result = await dorisClient.query("SELECT 1 as test_value");
    expect(result).toHaveLength(1);
    expect(result[0].test_value).toBe(1);
    console.log("✓ 基本查询成功");

    // 3. 验证表存在
    const tables = await dorisClient.query("SHOW TABLES");
    const tableNames = tables.map((row: any) => row.Tables_in_langfuse || row.table_name);
    expect(tableNames).toContain("traces");
    expect(tableNames).toContain("scores");
    expect(tableNames).toContain("observations");
    console.log("✓ 所有必需的表都存在");
  });

  it("should write and read trace data", async () => {
    const traceData = {
      id: "test-trace-1",
      name: "Test Trace",
      metadata: { test: "value" },
      tags: ["test"],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "test-project",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    };

    // 写入数据
    writer.addToQueue(TableName.Traces, traceData);
    await writer.forceFlushAll(true);
    console.log("✓ Trace 数据已写入");

    // 等待数据同步
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证数据是否写入成功
    const result = await dorisClient.query(
      "SELECT * FROM traces WHERE id = ?",
      [traceData.id]
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(traceData.id);
    expect(result[0].name).toBe(traceData.name);
    console.log("✓ Trace 数据查询验证成功");
  });

  it("should write and read score data", async () => {
    const scoreData = {
      id: "test-score-1",
      name: "Test Score",
      metadata: { test: "value" },
      timestamp: Date.now(),
      source: "test",
      environment: "test",
      project_id: "test-project",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      value: 0.8,
      data_type: "NUMERIC" as const,
      trace_id: "test-trace-1",
    };

    // 写入数据
    writer.addToQueue(TableName.Scores, scoreData);
    await writer.forceFlushAll(true);
    console.log("✓ Score 数据已写入");

    // 等待数据同步
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证数据是否写入成功
    const result = await dorisClient.query(
      "SELECT * FROM scores WHERE id = ?",
      [scoreData.id]
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(scoreData.id);
    expect(result[0].value).toBe(scoreData.value);
    expect(result[0].data_type).toBe(scoreData.data_type);
    console.log("✓ Score 数据查询验证成功");
  });

  it("should write and read observation data", async () => {
    const observationData = {
      id: "test-observation-1",
      name: "Test Observation",
      type: "GENERATION",
      metadata: { test: "value" },
      environment: "test",
      project_id: "test-project",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      start_time: Date.now(),
      event_ts: Date.now(),
      trace_id: "test-trace-1",
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: {},
      cost_details: {},
    };

    // 写入数据
    writer.addToQueue(TableName.Observations, observationData);
    await writer.forceFlushAll(true);
    console.log("✓ Observation 数据已写入");

    // 等待数据同步
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证数据是否写入成功
    const result = await dorisClient.query(
      "SELECT * FROM observations WHERE id = ?",
      [observationData.id]
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(observationData.id);
    expect(result[0].type).toBe(observationData.type);
    console.log("✓ Observation 数据查询验证成功");
  });

  it("should handle batch writes correctly", async () => {
    const batchSize = 5; // 减少批量大小以便测试
    const traces = Array.from({ length: batchSize }, (_, i) => ({
      id: `test-trace-batch-${i}`,
      name: `Test Trace ${i}`,
      metadata: { index: String(i) },
      tags: ["test", "batch"],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "test-project",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }));

    // 批量写入数据
    for (const trace of traces) {
      writer.addToQueue(TableName.Traces, trace);
    }
    await writer.forceFlushAll(true);
    console.log(`✓ 批量写入 ${batchSize} 条 Trace 数据`);

    // 等待数据同步
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 验证所有数据是否写入成功
    const result = await dorisClient.query(
      "SELECT COUNT(*) as count FROM traces WHERE id LIKE 'test-trace-batch-%'"
    );

    expect(result[0].count).toBe(batchSize);
    console.log("✓ 批量数据查询验证成功");
  });

  it("should handle concurrent writes", async () => {
    const concurrentWrites = 3; // 减少并发数量以便测试
    const writePromises = Array.from({ length: concurrentWrites }, (_, i) => {
      const trace = {
        id: `concurrent-trace-${i}`,
        name: `Concurrent Trace ${i}`,
        metadata: { index: String(i) },
        tags: ["test", "concurrent"],
        timestamp: Date.now(),
        public: false,
        bookmarked: false,
        environment: "test",
        project_id: "test-project",
        is_deleted: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      };
      return writer.addToQueue(TableName.Traces, trace);
    });

    // 等待所有写入完成
    await Promise.all(writePromises);
    await writer.forceFlushAll(true);
    console.log(`✓ 并发写入 ${concurrentWrites} 条数据`);

    // 等待数据同步
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 验证所有数据是否写入成功
    const result = await dorisClient.query(
      "SELECT COUNT(*) as count FROM traces WHERE id LIKE 'concurrent-trace-%'"
    );

    expect(result[0].count).toBe(concurrentWrites);
    console.log("✓ 并发数据查询验证成功");
  });
}); 