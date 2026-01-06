# Worker 模块中文开发指南

## 模块概述

Worker 是 Langfuse 的后台任务处理服务，基于 Express.js 和 BullMQ 构建，负责处理所有异步操作，包括数据摄入、评估执行、批量导出、数据删除等。

**技术栈：**
- **框架：** Express.js 5.2.1
- **队列系统：** BullMQ 5.34.10 + Redis
- **数据库：** Prisma 6.17.1 (PostgreSQL) + ClickHouse
- **可观测性：** OpenTelemetry
- **运行端口：** 3030（默认）

---

## 目录结构

```
worker/src/
├── index.ts                    # 入口文件，启动服务器
├── app.ts                      # Express 应用配置，队列注册
├── env.ts                      # 环境变量验证（Zod v4）
├── initialize.ts               # 启动时初始化脚本
├── instrumentation.ts          # OpenTelemetry 配置
├── queues/                     # 队列处理器（24+ 个）
│   ├── workerManager.ts       # 队列管理器（核心）
│   ├── ingestionQueue.ts      # 数据摄入队列
│   ├── evalQueue.ts           # 评估队列（4 个处理器）
│   ├── batchExportQueue.ts    # 批量导出
│   ├── batchActionQueue.ts    # 批量操作
│   ├── traceDelete.ts         # 追踪删除
│   ├── webhooks.ts            # Webhook 投递
│   └── ...                    # 更多队列
├── services/                   # 核心服务
│   ├── IngestionService/      # 数据摄入服务
│   ├── ClickhouseWriter/      # ClickHouse 批量写入
│   └── dlq/                   # 死信队列处理
├── features/                   # 功能模块
│   ├── evaluation/            # 评估逻辑
│   ├── batchExport/           # 批量导出
│   ├── batchAction/           # 批量操作
│   ├── traces/                # 追踪删除
│   ├── tokenisation/          # Token 计算
│   └── ...
├── backgroundMigrations/       # 后台迁移
├── api/                        # Express API 路由
├── utils/                      # 工具函数
│   ├── shutdown.ts            # 优雅关闭
│   └── clickhouseReadSkipCache.ts
├── errors/                     # 自定义错误类型
└── __tests__/                  # 测试文件
```

---

## 核心架构

### 1. 队列管理器 (WorkerManager)

**位置：** `queues/workerManager.ts`

WorkerManager 是所有队列的统一管理器，负责：
- 队列 Worker 注册
- 指标收集（请求数、等待时间、处理时间）
- 错误处理和上报
- 优雅关闭

```typescript
// 注册队列处理器
WorkerManager.register(
  queueName: QueueName,           // 队列名称
  processor: Processor,            // 处理函数
  additionalOptions: {             // 可选配置
    concurrency?: number,          // 并发数
    limiter?: {                    // 速率限制
      max: number,                 // 最大任务数
      duration: number,            // 时间窗口(ms)
    },
    lockDuration?: number,         // 锁超时(ms)
    stalledInterval?: number,      // 僵死检测间隔
    maxStalledCount?: number,      // 最大僵死次数
  }
);

// 关闭所有 Worker
await WorkerManager.closeWorkers();
```

**指标收集：**
- `langfuse_queue_{name}_request` - 请求计数
- `langfuse_queue_{name}_wait_time` - 等待时间
- `langfuse_queue_{name}_processing_time` - 处理时间
- `langfuse_queue_{name}_length` - 队列深度
- `langfuse_queue_{name}_dlq_length` - 死信队列深度

### 2. 数据摄入服务 (IngestionService)

**位置：** `services/IngestionService/index.ts`

负责处理从 S3 获取的事件数据，合并后写入 ClickHouse。

```typescript
class IngestionService {
  constructor(
    redis: Redis | Cluster,
    prisma: PrismaClient,
    clickHouseWriter: ClickhouseWriter,
    clickhouseClient: ClickhouseClientType,
  )

  // 主入口：合并事件并写入
  async mergeAndWrite(
    eventType: IngestionEntityTypes,  // "trace" | "observation" | "score" | "dataset_run_item"
    projectId: string,
    eventBodyId: string,
    createdAtTimestamp: number,
    events: IngestionEventType[],
    forwardToEventsTable: boolean,
  ): Promise<void>

  // 写入不可变事件（新事件系统）
  async writeEvent(
    eventData: InsertEvent,
    fileKey?: string,
  ): Promise<void>
}
```

**处理流程：**
1. 按实体类型路由到对应处理器
2. 合并同一实体的多个事件（按时间戳）
3. 保护不可变字段（id、project_id、timestamp、created_at）
4. 查找并富化提示词信息
5. 查找模型定价并计算成本
6. 异步计算 Token 数量（如未提供）
7. 扁平化元数据
8. 写入 ClickHouse 批量队列

### 3. ClickHouse 写入器 (ClickhouseWriter)

**位置：** `services/ClickhouseWriter/index.ts`

单例模式的批量写入服务，提供高效的数据写入。

```typescript
class ClickhouseWriter {
  // 获取单例
  static getInstance(): ClickhouseWriter

  // 添加记录到队列
  addToQueue(tableName: TableName, record: InsertRecord): void

  // 刷新所有队列（关闭时调用）
  async shutdown(): Promise<void>
}

// 支持的表
enum TableName {
  Traces = "traces",
  TracesNull = "traces_null",
  Scores = "scores",
  Observations = "observations",
  ObservationsBatchStaging = "observations_batch_staging",
  BlobStorageFileLog = "blob_storage_file_log",
  DatasetRunItems = "dataset_run_items",
  Events = "events",
}
```

**写入策略：**
- **间隔写入：** 每 `LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS` 毫秒（默认 1000ms）
- **批量写入：** 当队列达到 `LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE`（默认 1000）
- **重试逻辑：** 指数退避，最多 `LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS` 次（默认 3）

**错误处理：**
- Socket 错误：自动重试
- JSON 大小错误：拆分批次重试
- 字符串长度错误：截断超大字段（input/output/metadata 限制 1MB）

---

## 队列系统详解

### 队列分类

#### 1. 数据摄入队列

| 队列 | 环境变量 | 并发 | 说明 |
|------|----------|------|------|
| `IngestionQueue` | `QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED` | 20 | 主数据摄入 |
| `OtelIngestionQueue` | `QUEUE_CONSUMER_OTEL_INGESTION_QUEUE_IS_ENABLED` | 5 | OpenTelemetry 摄入 |
| `IngestionSecondaryQueue` | `QUEUE_CONSUMER_INGESTION_SECONDARY_QUEUE_IS_ENABLED` | 5 | 次级摄入（高负载项目） |

**摄入队列处理器：** `queues/ingestionQueue.ts`
```typescript
const processor = async (job: Job<TQueueJobTypes[QueueName.IngestionQueue]>) => {
  // 1. 记录文件到 BlobStorageFileLog
  // 2. 检查 Redis 缓存避免重复处理
  // 3. 检查是否需要重定向到次级队列
  // 4. 从 S3 下载事件数据
  // 5. 调用 IngestionService.mergeAndWrite()
}
```

#### 2. 评估队列

| 队列 | 处理器 | 并发 | 说明 |
|------|--------|------|------|
| `TraceUpsert` | `evalJobTraceCreatorQueueProcessor` | 25 | 新追踪触发评估 |
| `CreateEvalQueue` | `evalJobCreatorQueueProcessor` | 2 | 批量创建评估任务 |
| `DatasetRunItemUpsert` | `evalJobDatasetCreatorQueueProcessor` | 2 | 数据集项触发评估 |
| `EvaluationExecution` | `evalJobExecutorQueueProcessor` | 5 | 执行评估任务 |

**评估执行处理器：** `queues/evalQueue.ts`
```typescript
const evalJobExecutorQueueProcessor = async (job) => {
  try {
    await evaluate({ event: job.data.payload });
    return true;
  } catch (e) {
    // LLM 速率限制错误处理
    if (isLLMCompletionError(e) && e.isRetryable) {
      await retryLLMRateLimitError(job, config);
      await prisma.jobExecution.update({
        where: { id: job.data.payload.jobExecutionId },
        data: { status: JobExecutionStatus.DELAYED },
      });
      return; // 手动重试已安排
    }

    // 其他错误：标记失败
    await prisma.jobExecution.update({
      data: { status: JobExecutionStatus.ERROR },
    });

    if (isUnrecoverableError(e)) {
      return true; // 不可恢复，不重试
    }
    throw e; // BullMQ 自动重试
  }
};
```

#### 3. 删除队列

| 队列 | 速率限制 | 说明 |
|------|----------|------|
| `TraceDelete` | 1 次/2 分钟 | 追踪删除 |
| `ScoreDelete` | 1 次/15 秒 | 评分删除 |
| `DatasetDelete` | 1 次/2 分钟 | 数据集删除 |
| `ProjectDelete` | 1 次/10 分钟 | 项目删除（最严格） |

**重要：** 删除操作会触发 ClickHouse mutation，需要严格限速避免过载。

#### 4. 批量操作队列

| 队列 | 并发 | 速率限制 | 说明 |
|------|------|----------|------|
| `BatchExport` | 1 | 1 次/5 秒 | 数据导出到 S3 |
| `BatchAction` | 1 | 1 次/5 秒 | 批量操作（删除、添加到队列） |

#### 5. 集成队列（两阶段模式）

集成队列采用两阶段架构：调度阶段 + 处理阶段

```
调度器 (Scheduler)
    ↓ 定时触发
查询需要处理的项目
    ↓
为每个项目创建处理任务
    ↓
处理器 (Processor)
    ↓
执行具体的集成逻辑
```

| 队列 | 调度处理器 | 执行处理器 |
|------|------------|------------|
| `PostHogIntegration` | `postHogIntegrationProcessor` | `postHogIntegrationProcessingProcessor` |
| `MixpanelIntegration` | `mixpanelIntegrationProcessor` | `mixpanelIntegrationProcessingProcessor` |
| `BlobStorageIntegration` | `blobStorageIntegrationProcessor` | `blobStorageIntegrationProcessingProcessor` |

#### 6. 其他队列

| 队列 | 用途 |
|------|------|
| `WebhookQueue` | Webhook 投递（支持签名验证） |
| `NotificationQueue` | 内部通知（评论提及等） |
| `EntityChangeQueue` | 实体变更事件（提示词版本等） |
| `EventPropagationQueue` | 事件传播到 events 表 |
| `ExperimentCreate` | 创建实验 |
| `DataRetentionQueue` | 数据保留策略执行 |
| `DeadLetterRetry` | 死信队列重试（每 10 分钟） |

---

## 错误处理模式

### 1. BullMQ 自动重试

默认情况下，处理器抛出异常会触发 BullMQ 的自动重试机制：
- 默认 3 次重试
- 指数退避

```typescript
// 标准错误处理模式
const processor = async (job) => {
  try {
    // 处理逻辑
    return true;
  } catch (e) {
    logger.error(`Job failed: ${job.id}`, e);
    traceException(e);
    throw e; // 触发 BullMQ 重试
  }
};
```

### 2. LLM 速率限制重试

**位置：** `features/utils/retry-handler.ts`

用于处理 LLM API 的 429/5xx 错误：

```typescript
await retryLLMRateLimitError(job, {
  table: "job_executions",
  idField: "jobExecutionId",
  queue: EvalExecutionQueue.getInstance(),
  queueName: QueueName.EvaluationExecution,
  jobName: QueueJobs.EvaluationExecution,
  delayFn: delayInMs,
});
```

**特点：**
- 任务超过 24 小时不再重试
- 指数退避：1-25 分钟
- 通过 `retryBaggage` 跟踪重试次数

### 3. 不可恢复错误

**位置：** `errors/UnrecoverableError.ts`

用于标记不应重试的错误：

```typescript
import { isUnrecoverableError } from "../errors/UnrecoverableError";

if (isUnrecoverableError(e)) {
  logger.warn("Unrecoverable error, skipping job", e);
  return true; // 完成任务，不重试
}
```

### 4. 观测未找到重试

**位置：** `features/evaluation/retryObservationNotFound.ts`

用于数据集评估时观测尚未写入的情况：

```typescript
if (isObservationNotFoundError(e)) {
  const shouldRetry = await retryObservationNotFound(e, {
    data: { projectId, datasetItemId, traceId, observationId, retryBaggage },
  });
  if (shouldRetry) return true; // 重试已安排
  // 达到最大重试次数
  return true;
}
```

### 5. 死信队列重试

**位置：** `services/dlq/dlqRetryService.ts`

每 10 分钟自动重试死信队列中的任务：

```typescript
// 支持的重试队列
const retryQueues = [
  QueueName.ProjectDelete,
  QueueName.TraceDelete,
  QueueName.ScoreDelete,
  QueueName.BatchActionQueue,
  QueueName.DataRetentionProcessingQueue,
];
```

---

## 后台迁移系统

**位置：** `backgroundMigrations/`

非阻塞的数据迁移系统，在 Worker 启动时运行。

### 迁移接口

```typescript
interface IBackgroundMigration {
  // 验证迁移参数
  validate(args: Record<string, unknown>): Promise<{
    valid: boolean;
    invalidReason?: string;
  }>;

  // 执行迁移
  run(args: Record<string, unknown>): Promise<void>;

  // 中止迁移
  abort(): Promise<void>;
}
```

### 现有迁移脚本

| 迁移名称 | 用途 |
|----------|------|
| `migrateTracesFromPostgresToClickhouse` | 追踪数据迁移 |
| `migrateObservationsFromPostgresToClickhouse` | 观测数据迁移 |
| `migrateScoresFromPostgresToClickhouse` | 评分数据迁移 |
| `addGenerationsCostBackfill` | 回填生成成本 |
| `encryptBlobStorageSecrets` | 加密存储密钥 |
| `backfillEventsHistoric` | 历史事件回填 |

### 执行机制

- 数据库驱动（`backgroundMigration` 表）
- 分布式锁（`workerId`, `lockedAt`）
- 心跳续期（15 秒间隔）
- 串行执行（按名称排序）

---

## 关键配置项

### 队列并发配置

```bash
# 数据摄入
LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY=20
LANGFUSE_OTEL_INGESTION_QUEUE_PROCESSING_CONCURRENCY=5
LANGFUSE_INGESTION_SECONDARY_QUEUE_PROCESSING_CONCURRENCY=5

# 评估
LANGFUSE_TRACE_UPSERT_WORKER_CONCURRENCY=25
LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY=2
LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY=5

# 删除
LANGFUSE_TRACE_DELETE_CONCURRENCY=1
LANGFUSE_SCORE_DELETE_CONCURRENCY=1
LANGFUSE_PROJECT_DELETE_CONCURRENCY=1

# Webhook
LANGFUSE_WEBHOOK_QUEUE_PROCESSING_CONCURRENCY=5
```

### ClickHouse 写入配置

```bash
LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE=1000    # 批量大小
LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS=1000   # 刷新间隔
LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS=3           # 最大重试
```

### 队列消费者开关

每个队列都有独立的开关：

```bash
QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED=true
QUEUE_CONSUMER_EVAL_EXECUTION_QUEUE_IS_ENABLED=true
QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED=true
QUEUE_CONSUMER_WEBHOOK_QUEUE_IS_ENABLED=true
# ... 更多队列
```

### 删除操作速率限制

```bash
LANGFUSE_CLICKHOUSE_TRACE_DELETION_CONCURRENCY_DURATION_MS=120000    # 2 分钟
LANGFUSE_CLICKHOUSE_DATASET_DELETION_CONCURRENCY_DURATION_MS=120000  # 2 分钟
LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS=600000  # 10 分钟
```

### Mutation 监控

```bash
LANGFUSE_MUTATION_MONITOR_ENABLED=false
LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS=60000    # 1 分钟
LANGFUSE_DELETION_MUTATIONS_MAX_COUNT=15             # 暂停阈值
LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT=1             # 恢复阈值
```

---

## 开发指南

### 添加新队列

1. **创建队列处理器文件** `queues/myQueue.ts`：

```typescript
import { Job } from "bullmq";
import { QueueName, TQueueJobTypes, logger, traceException } from "@langfuse/shared/src/server";

export const myQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.MyQueue]>,
) => {
  try {
    // 处理逻辑
    const { projectId, data } = job.data.payload;

    // 业务逻辑...

    return true;
  } catch (e) {
    logger.error(`Failed job ${job.id}`, e);
    traceException(e);
    throw e; // 触发重试
  }
};
```

2. **在 `app.ts` 中注册**：

```typescript
if (env.QUEUE_CONSUMER_MY_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.MyQueue,
    myQueueProcessor,
    {
      concurrency: env.LANGFUSE_MY_QUEUE_CONCURRENCY,
      limiter: {
        max: 1,
        duration: 5000, // 5 秒 1 个任务
      },
    },
  );
}
```

3. **在 `env.ts` 中添加配置**：

```typescript
QUEUE_CONSUMER_MY_QUEUE_IS_ENABLED: z
  .enum(["true", "false"])
  .default("true"),
LANGFUSE_MY_QUEUE_CONCURRENCY: z.coerce
  .number()
  .positive()
  .default(5),
```

4. **在 `@langfuse/shared` 中定义任务类型**（如需要）

### 处理器开发要点

1. **幂等性**：处理器必须是幂等的，因为任务可能重试
2. **错误分类**：区分可重试和不可重试的错误
3. **指标记录**：使用 `recordIncrement`、`recordHistogram` 记录关键指标
4. **日志记录**：使用 `logger` 记录关键步骤
5. **追踪上报**：使用 `traceException` 上报异常

### 测试

Worker 使用 Vitest 进行测试：

```bash
# 运行所有测试
pnpm run test --filter=worker

# 运行特定测试
pnpm run test --filter=worker -- evalService.test.ts -t "should create eval jobs"
```

**测试模式：**
- Mock 网络请求（OpenAI、Webhook）
- 使用真实 Prisma 进行集成测试
- 每个测试独立，使用 `randomUUID` 生成唯一 ID

---

## 优雅关闭

**位置：** `utils/shutdown.ts`

Worker 支持优雅关闭，确保数据不丢失：

```typescript
// 关闭顺序
1. 设置 SIGTERM 标志
2. 停止接受新连接
3. 停止 Mutation 监控
4. 关闭所有 BullMQ Workers（等待进行中的任务）
5. 关闭后台迁移
6. 刷新 ClickHouse 写入器（关键！）
7. 断开 Redis 连接
8. 断开 Prisma 连接
9. 关闭 ClickHouse 连接
10. 终止 Token 计算线程
11. 退出进程
```

**关键点：** ClickHouse 刷新必须在 Workers 关闭之后，确保队列中的数据全部写入。

---

## API 端点

Worker 提供以下 HTTP 端点：

| 端点 | 用途 |
|------|------|
| `GET /` | 服务信息 |
| `GET /api/health` | 健康检查（DB + Redis） |
| `GET /api/ready` | 就绪检查（健康 + SIGTERM） |

**健康检查用于：**
- Kubernetes 存活探针
- 负载均衡器健康检查

---

## 可观测性

### OpenTelemetry 配置

**位置：** `instrumentation.ts`

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=worker
```

**自动检测：**
- Redis 操作
- HTTP 请求
- Express 路由
- Prisma 查询
- BullMQ 任务

### 日志

使用 Winston 记录日志，支持结构化日志格式。

### 指标

所有队列自动记录以下指标：
- 请求数、等待时间、处理时间
- 队列深度、死信队列深度
- 失败和错误计数

---

## 常见问题

### ClickHouse Mutation 积压

**症状：** 删除操作变慢，队列堆积

**解决方案：**
1. 启用 Mutation 监控：`LANGFUSE_MUTATION_MONITOR_ENABLED=true`
2. 调整阈值：`LANGFUSE_DELETION_MUTATIONS_MAX_COUNT`
3. 增加删除间隔

### 评估任务失败

**症状：** 评估任务持续失败

**检查点：**
1. LLM API 配额是否充足
2. 查看 `job_executions` 表的错误信息
3. 检查评估模板配置

### 数据摄入延迟

**症状：** 追踪数据写入延迟

**解决方案：**
1. 增加摄入并发：`LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY`
2. 增加 ClickHouse 批量大小
3. 检查 S3 慢速标志，启用次级队列
