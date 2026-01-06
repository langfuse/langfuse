# CLAUDE-ZH.md - Langfuse 项目中文指南

## 项目概述

Langfuse 是一个开源的 LLM 工程平台，帮助团队协作开发、监控、评估和调试 AI 应用程序。

**核心功能领域：**
- **Tracing（追踪）**：记录和分析 LLM 调用的完整链路
- **Evals（评估）**：自动化评估 LLM 输出质量
- **Prompt Management（提示词管理）**：版本化管理和部署提示词

**本仓库包含：**
- Web 应用程序（Next.js 14）
- Worker 后台处理服务（Express.js）
- 共享包（数据库模型、工具函数）

**不包含：**
- Python SDK（独立仓库）
- JavaScript/TypeScript SDK（独立仓库）

---

## 仓库结构

### 顶层目录

```
langfuse/
├── web/                     # Next.js 14 前后端应用（端口 3000）
├── worker/                  # Express.js 后台任务处理器（端口 3030）
├── packages/
│   ├── shared/             # 共享代码：数据库模型、类型定义、工具函数
│   ├── config-eslint/      # 共享 ESLint 配置
│   └── config-typescript/  # 共享 TypeScript 配置
├── ee/                     # 企业版功能（独立许可证）
├── fern/                   # API 文档和 OpenAPI 规范
├── scripts/                # 开发和部署脚本
├── docker-compose.yml      # 生产环境 Docker 配置
├── docker-compose.dev.yml  # 开发环境 Docker 配置
├── turbo.json             # Turborepo 构建编排配置
└── pnpm-workspace.yaml    # pnpm 工作区配置
```

### Web 应用结构 (`/web/src/`)

```
web/src/
├── pages/                   # Next.js Pages Router 页面
│   ├── api/                # API 路由
│   │   ├── public/        # 公开 REST API（23+ 端点）
│   │   ├── auth/          # 认证相关路由
│   │   ├── admin/         # 管理员端点
│   │   └── trpc/          # tRPC 端点入口
│   ├── project/           # 项目相关页面
│   ├── organization/      # 组织管理页面
│   └── trace/             # 追踪查看页面
├── server/                 # 服务端逻辑
│   ├── api/
│   │   ├── root.ts       # tRPC 路由根配置（60+ 路由组）
│   │   ├── trpc.ts       # tRPC 初始化和上下文
│   │   └── routers/      # 各个 tRPC 路由器
│   └── auth.ts           # NextAuth 认证配置（31KB）
├── features/              # 功能模块（60+ 个）
│   ├── traces/           # 追踪功能
│   ├── evals/            # 评估功能
│   ├── prompts/          # 提示词管理
│   ├── datasets/         # 数据集管理
│   ├── experiments/      # 实验功能
│   ├── rbac/             # 权限控制
│   ├── public-api/       # 公开 API 类型定义
│   └── ...               # 更多功能模块
├── components/            # 可复用 UI 组件
│   ├── ui/              # shadcn/ui 基础组件
│   └── ...              # 业务组件
├── hooks/                # React Hooks
├── utils/                # 工具函数
└── ee/                   # 企业版前端功能
```

### Worker 应用结构 (`/worker/src/`)

```
worker/src/
├── queues/                 # BullMQ 队列处理器（24+ 个）
│   ├── ingestionQueue.ts  # 主数据摄入队列
│   ├── evalQueue.ts       # 评估任务队列
│   ├── batchExportQueue.ts# 批量导出队列
│   ├── webhooks.ts        # Webhook 投递队列
│   └── workerManager.ts   # 队列编排管理
├── services/              # 核心服务
│   ├── IngestionService/  # 数据摄入服务（1780 行）
│   └── ClickhouseWriter/  # ClickHouse 写入服务
├── features/              # Worker 专属功能
│   ├── evaluation/       # 评估执行
│   ├── batchExport/      # 批量导出
│   └── ...
├── app.ts                # Express 应用配置
├── index.ts              # 入口文件
└── env.ts                # 环境变量
```

### 共享包结构 (`/packages/shared/`)

```
packages/shared/
├── prisma/
│   ├── schema.prisma      # PostgreSQL 数据库模型（完整定义）
│   └── migrations/        # 370+ 数据库迁移文件
├── clickhouse/
│   ├── migrations/        # ClickHouse DDL 迁移
│   │   ├── clustered/    # 集群模式迁移
│   │   └── unclustered/  # 单机模式迁移
│   └── scripts/          # 迁移脚本
└── src/
    ├── db.ts             # Prisma 客户端导出
    ├── server/
    │   ├── services/     # 后端服务
    │   │   ├── PromptService/    # 提示词服务
    │   │   └── DatasetService/   # 数据集服务
    │   └── repositories/ # ClickHouse 数据访问层
    ├── features/
    │   └── entitlements/ # 功能权限定义
    └── encryption/       # 加密工具
```

---

## 核心架构

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | Next.js 14 (Pages Router) | React 19.2.3 |
| **后端 API** | tRPC v11.8.0 | 类型安全的客户端-服务端通信 |
| **公开 API** | REST | 供 SDK 和外部系统调用 |
| **认证** | NextAuth.js 4.24.13 | 支持多种 OAuth 提供商 |
| **主数据库** | PostgreSQL 17 | 通过 Prisma 6.17.1 ORM 访问 |
| **分析数据库** | ClickHouse 25.8 | 高吞吐量追踪数据 |
| **缓存/队列** | Redis 7.2.4 | BullMQ 5.34.10 任务队列 |
| **对象存储** | MinIO/S3 | 媒体文件和大型数据导出 |
| **UI 组件** | shadcn/ui | 基于 Radix UI |
| **样式** | Tailwind CSS | CSS 变量主题化 |
| **验证** | Zod v4 | 输入验证 |
| **可观测性** | OpenTelemetry | 分布式追踪 |

### 双数据库架构

Langfuse 采用 PostgreSQL + ClickHouse 双数据库架构：

```
┌─────────────────────────────────────────────────────────────┐
│                      数据写入流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   API 请求 → 验证 → PostgreSQL（立即写入）                    │
│                  ↓                                          │
│            BullMQ 队列                                       │
│                  ↓                                          │
│            ClickHouse（批量写入，异步）                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| 数据库 | 用途 | 一致性 | 数据类型 |
|--------|------|--------|----------|
| **PostgreSQL** | OLTP 事务处理 | 强一致性 | 用户、组织、项目、提示词、配置 |
| **ClickHouse** | OLAP 分析查询 | 最终一致性 | 追踪、观测、评分、事件（高吞吐量） |

### 认证系统

**位置：** `/web/src/server/auth.ts`

**支持的认证提供商：**
- **凭证登录**：邮箱/密码
- **OAuth**：Google、GitHub、GitLab、Auth0、Azure AD
- **企业 SSO（EE）**：Okta、Keycloak、OneLogin、Authentik、WorkOS、自定义 OIDC

### 权限控制 (RBAC)

**位置：** `/web/src/features/rbac/`

```
权限层级：
├── 超级管理员 (User.admin = true)
│   └── 完全访问所有组织和项目
├── 组织级别 (OrganizationMembership.role)
│   ├── OWNER - 组织所有者
│   ├── ADMIN - 管理员
│   ├── MEMBER - 成员
│   └── VIEWER - 只读
└── 项目级别 (ProjectMembership.role)
    ├── OWNER - 项目所有者
    ├── MEMBER - 项目成员
    └── VIEWER - 只读查看
```

**关键文件：**
- `checkProjectAccess.ts` - 权限检查工具
- `projectAccessRights.ts` - 权限矩阵定义

---

## 核心数据流

### 1. 数据摄入流程（Ingestion）

**关键服务：** `/worker/src/services/IngestionService/index.ts`

```
SDK/API 请求
    ↓
/api/public/ingestion（REST API）
    ↓
验证 + API Key 认证
    ↓
写入 PostgreSQL 事件表
    ↓
加入 IngestionQueue（BullMQ）
    ↓
IngestionService.mergeAndWrite()
    ├── processTraceEventList() → Traces 表
    ├── processObservationEventList() → Observations 表
    ├── processScoreEventList() → Scores 表
    └── processDatasetRunItemEventList() → DatasetRunItems 表
    ↓
ClickhouseWriter.addToQueue()
    ↓
批量写入 ClickHouse（带重试逻辑）
```

**数据处理逻辑：**
- 按时间戳合并同一实体的多个事件
- 保护不可变字段（id、project_id、timestamp、created_at）
- 异步计算 Token 数量（当请求未提供时）
- 通过模型定价层计算成本
- 双写 PostgreSQL sessions 表用于过滤

### 2. 评估流程（Evaluation）

**关键服务：** `/worker/src/features/evaluation/evalService.ts`

```
触发源：
├── TraceQueue（新追踪数据）→ 时间范围: "NEW"
├── DatasetRunItemUpsert（数据集项）→ 时间范围: "NEW"
└── CreateEvalQueue（历史批量）→ 无时间范围限制
    ↓
createEvalJobs() - 获取活跃的评估配置
    ├── 任务类型: "EVAL"
    ├── 状态: "ACTIVE"
    ├── 时间范围过滤 (NEW/EXISTING/ALL)
    └── 采样率控制
    ↓
验证检查：
├── checkTraceExistsAndGetTimestamp()
└── checkObservationExists()（针对观测）
    ↓
创建 EvaluationExecution 任务
├── 配置延迟（默认 10 秒）
├── 变量映射（追踪字段 → 评估模板变量）
└── 过滤器应用
    ↓
evalJobExecutorQueueProcessor()
└── evaluate() - 调用 LLM 执行评估
    ↓
创建评分记录（source: "EVAL"）
```

**评估配置模型：**
- `JobConfiguration` - 评估模板配置
- `JobExecution` - 单次评估执行记录
- 输出格式：`{score: string, reasoning: string}`
- 支持自定义 LLM（OpenAI、Anthropic、Azure 等）

### 3. 提示词管理流程（Prompt Management）

**关键服务：** `/packages/shared/src/server/services/PromptService/index.ts`

```
getPrompt(projectId, promptName, version|label, ...)
    ↓
Redis 缓存查找
├── 缓存键: {projectId}:{promptName}:{version|label}
└── TTL: 可配置
    ↓（缓存未命中）
PostgreSQL 查询：
├── 按版本号（精确匹配）
├── 按标签（PRODUCTION、STAGING 等）
└── 默认获取最新版本
    ↓
resolvePrompt() - 递归依赖解析
└── buildAndResolvePromptGraph() - 最多 5 层嵌套
    ├── 检测循环依赖
    └── 解析 prompt:// 引用
    ↓
缓存写入 + 返回结果
```

**版本控制：**
- 版本号：递增整数
- 标签：数组形式（PRODUCTION、STAGING、自定义）
- 受保护标签：按项目配置
- 事件溯源：完整审计日志

---

## 关键功能模块及代码位置

### 追踪系统 (Tracing)

| 组件 | 位置 | 说明 |
|------|------|------|
| 追踪列表页面 | `/web/src/features/traces/` | 前端组件和 Hooks |
| tRPC 路由 | `/web/src/server/api/routers/traces.ts` | 查询和操作 API |
| 数据摄入 | `/web/src/pages/api/public/ingestion.ts` | REST API 入口 |
| 摄入服务 | `/worker/src/services/IngestionService/` | 核心处理逻辑 |
| ClickHouse 存储 | `/packages/shared/src/server/repositories/traces.ts` | 数据访问层 |

### 评估系统 (Evals)

| 组件 | 位置 | 说明 |
|------|------|------|
| 评估配置页面 | `/web/src/features/evals/` | 前端配置界面 |
| tRPC 路由 | `/web/src/features/evals/server/router.ts` | 配置管理 API |
| 评估服务 | `/worker/src/features/evaluation/evalService.ts` | 任务创建和执行 |
| 队列处理 | `/worker/src/queues/evalQueue.ts` | BullMQ 队列处理器 |

### 提示词管理 (Prompts)

| 组件 | 位置 | 说明 |
|------|------|------|
| 提示词页面 | `/web/src/features/prompts/` | 前端编辑界面 |
| tRPC 路由 | `/web/src/features/prompts/server/routers/promptRouter.ts` | CRUD API |
| 提示词服务 | `/packages/shared/src/server/services/PromptService/` | 缓存和解析 |
| 公开 API | `/web/src/pages/api/public/prompts.ts` | REST API |

### 数据集 (Datasets)

| 组件 | 位置 | 说明 |
|------|------|------|
| 数据集页面 | `/web/src/features/datasets/` | 前端管理界面 |
| 数据集服务 | `/packages/shared/src/server/services/DatasetService/` | 核心逻辑 |
| 公开 API | `/web/src/pages/api/public/datasets.ts` | REST API |

### 公开 API

| 组件 | 位置 | 说明 |
|------|------|------|
| REST 端点 | `/web/src/pages/api/public/` | 23+ API 端点 |
| 类型定义 | `/web/src/features/public-api/types/` | Zod v4 验证模式 |
| 中间件 | `/web/src/features/public-api/server/` | 认证和错误处理 |
| API 文档 | `/fern/` | OpenAPI 规范 |

### Worker 队列系统

| 队列 | 位置 | 用途 |
|------|------|------|
| `IngestionQueue` | `queues/ingestionQueue.ts` | 追踪/观测/评分摄入 |
| `EvalQueue` | `queues/evalQueue.ts` | 评估任务创建和执行 |
| `BatchExportQueue` | `queues/batchExportQueue.ts` | 数据批量导出 |
| `WebhookQueue` | `queues/webhooks.ts` | Webhook 投递 |
| `TraceDelete` | `queues/traceDelete.ts` | 追踪异步删除 |
| `DataRetentionQueue` | `queues/dataRetentionQueue.ts` | 数据保留策略执行 |

---

## 数据库模型

### PostgreSQL 核心表

**位置：** `/packages/shared/prisma/schema.prisma`

```
核心实体：
├── 用户和认证
│   ├── users - 用户表
│   ├── accounts - OAuth 账户（NextAuth）
│   └── sessions - 会话（NextAuth）
├── 组织和权限
│   ├── organizations - 组织
│   ├── organizationMemberships - 组织成员
│   ├── projectMemberships - 项目成员
│   └── membershipInvitations - 邀请
├── 追踪数据
│   ├── traces - 追踪记录
│   ├── observations - 观测记录
│   ├── sessions - 会话
│   └── scores - 评分
├── 提示词和模型
│   ├── prompts - 提示词
│   ├── promptVersions - 提示词版本
│   ├── models - 模型定义
│   └── llmApiKeys - LLM API 密钥
├── 数据集和评估
│   ├── datasets - 数据集
│   ├── datasetItems - 数据集项
│   ├── datasetRuns - 数据集运行
│   ├── jobConfigurations - 评估配置
│   └── jobExecutions - 评估执行记录
└── 配置
    ├── scoreConfigs - 评分配置
    ├── dashboards - 仪表盘
    └── dashboardWidgets - 仪表盘组件
```

### ClickHouse 表

**位置：** `/packages/shared/clickhouse/migrations/`

- `traces` - 追踪记录（高吞吐量写入）
- `observations` - 观测记录
- `scores` - 评分记录
- `events` - 事件日志

---

## 部署和基础设施

### Docker Compose 配置

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 生产环境完整部署 |
| `docker-compose.dev.yml` | 开发环境 |
| `docker-compose.build.yml` | 本地构建测试 |
| `docker-compose.dev-azure.yml` | Azure Blob Storage 开发 |
| `docker-compose.dev-redis-cluster.yml` | Redis 集群开发 |

### 服务组件

```
生产环境服务：
├── langfuse-web      # Next.js 应用（端口 3000）
├── langfuse-worker   # Express 后台处理（端口 3030）
├── postgres          # PostgreSQL 17（端口 5432）
├── clickhouse        # ClickHouse 25.8（端口 8123/9000）
├── redis             # Redis 7.2.4（端口 6379）
└── minio             # MinIO S3 存储（端口 9090/9091）
```

### 环境变量配置

**配置文件：**
- `.env.dev.example` - 开发环境模板
- `.env.prod.example` - 生产环境模板

**核心配置分类：**

```bash
# 数据库 (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/db
DIRECT_URL=postgresql://...  # 用于迁移，无连接池

# ClickHouse
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_MIGRATION_URL=clickhouse://localhost:9000
CLICKHOUSE_USER=clickhouse
CLICKHOUSE_PASSWORD=...
CLICKHOUSE_CLUSTER_ENABLED=false  # 集群模式

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_AUTH=...
# 或集群模式
REDIS_CLUSTER_ENABLED=true
REDIS_CLUSTER_NODES=host1:port1,host2:port2

# 对象存储
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=...
LANGFUSE_S3_MEDIA_UPLOAD_BUCKET=...
LANGFUSE_S3_BATCH_EXPORT_BUCKET=...
# 或使用 Azure/GCS
LANGFUSE_USE_AZURE_BLOB=true
LANGFUSE_USE_GOOGLE_CLOUD_STORAGE=true

# 认证
NEXTAUTH_SECRET=...  # 生产必需
SALT=...  # API Key 哈希盐
ENCRYPTION_KEY=...  # 256位加密密钥

# OAuth 提供商
AUTH_GOOGLE_CLIENT_ID=...
AUTH_GOOGLE_CLIENT_SECRET=...
AUTH_GITHUB_CLIENT_ID=...
# ...更多提供商

# 初始化配置（可选，自动创建用户/项目）
LANGFUSE_INIT_ORG_NAME=...
LANGFUSE_INIT_PROJECT_NAME=...
LANGFUSE_INIT_USER_EMAIL=...
```

### 数据库迁移

**PostgreSQL 迁移（Prisma）：**
```bash
cd packages/shared
pnpm run db:generate   # 生成 Prisma 客户端
pnpm run db:migrate    # 应用迁移
```

**ClickHouse 迁移（golang-migrate）：**
```bash
# 迁移脚本位于 /packages/shared/clickhouse/scripts/
./up.sh      # 应用迁移
./down.sh    # 回滚迁移
./drop.sh    # 删除所有表
```

**容器启动自动迁移：**
- Web 入口点：`/web/entrypoint.sh`
  - 验证数据库连接
  - 运行 Prisma 迁移
  - 运行 ClickHouse 迁移

### 生产部署选项

**1. Docker Compose 自托管：**
```bash
# 使用预构建镜像
docker pull langfuse/langfuse:3
docker pull langfuse/langfuse-worker:3

# 启动所有服务
docker-compose up -d
```

**2. Kubernetes 部署：**
- 基于 Docker Compose 配置创建 K8s 清单
- 需要配置 PVC 存储
- 建议使用托管数据库服务

**3. Langfuse Cloud（托管服务）：**
- 区域：US、EU、HIPAA
- 多租户架构
- 通过 `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` 配置

### 资源建议

**开发环境：**
- PostgreSQL: 2GB+ RAM
- ClickHouse: 4GB+ RAM
- Redis: 1GB+ RAM
- Web: 2GB+ RAM, 2 CPU
- Worker: 1GB+ RAM, 1 CPU

**生产环境：**
- PostgreSQL: 16GB+ RAM，建议读副本
- ClickHouse: 12GB+ per node，建议集群
- Redis: 4GB+ per node，建议集群或 Sentinel
- Web/Worker: 水平扩展

---

## 开发命令

### 环境准备

```bash
# 安装依赖
pnpm i

# 启动基础设施（Docker 服务）
pnpm run infra:dev:up

# 复制环境配置
cp .env.dev.example .env

# 数据库初始化
cd packages/shared
pnpm run db:generate
pnpm run db:migrate
pnpm run db:seed
```

### 日常开发

```bash
# 启动所有服务
pnpm run dev

# 仅启动 Web 应用（最常用）
pnpm run dev:web

# 仅启动 Worker
pnpm run dev:worker

# 完整重置（慎用，会清空数据）
pnpm run dx
```

### 构建和测试

```bash
# 构建指定包
pnpm --filter=web run build
pnpm --filter=worker run build

# 代码格式化
pnpm run format

# Lint 检查
pnpm run lint

# Web 包测试（Jest）
cd web
pnpm test-sync --testPathPatterns="$FILE_PATTERN"
pnpm test -- --testPathPatterns="$FILE_PATTERN"  # async 目录

# Worker 包测试（Vitest）
pnpm run test --filter=worker -- $TEST_FILE -t "$TEST_NAME"
```

### 数据库管理

```bash
cd packages/shared

# 生成 Prisma 客户端
pnpm run db:generate

# 运行迁移
pnpm run db:migrate

# 重置数据库
pnpm run db:reset

# 种子数据
pnpm run db:seed
```

### 清理命令

```bash
# 停止 Docker 服务
pnpm run infra:dev:down

# 完全清理（慎用）
pnpm run nuke
```

---

## 开发登录凭证

本地开发使用种子数据时：
- **用户名：** `demo@langfuse.com`
- **密码：** `password`
- **演示项目 URL：** `http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`

---

## 开发规范

### 代码组织

- 新功能放在 `/web/src/features/[feature-name]/`
- 使用 tRPC 处理全栈功能（入口：`web/src/server/api/root.ts`）
- 使用 shadcn/ui 组件（`@/src/components/ui`）
- 遵循 Pages Router 模式（非 App Router）

### API 开发

- 公开 API 放在 `/web/src/pages/api/public/`
- 使用 `withMiddlewares.ts` 包装器
- 类型定义使用 Zod v4 严格模式
- 更新 `/fern/` 中的 API 规范

### 测试规范

- Jest 用于 Web API 测试
- Vitest 用于 Worker 测试
- Playwright 用于 E2E 测试
- 测试用例需独立可并行执行
- 避免在 async 目录中使用 `pruneDatabase`

### TypeScript 规范

- 避免使用 `any` 类型
- 使用 Zod v4 进行输入验证（`import { z } from "zod/v4"`）
- 遵循严格的类型检查

---

## 关键入口点索引

| 系统 | 入口文件 | 说明 |
|------|----------|------|
| Web 应用 | `/web/src/pages/_app.tsx` | Next.js 应用入口 |
| tRPC API | `/web/src/pages/api/trpc/[trpc].ts` | tRPC 端点 |
| tRPC 路由 | `/web/src/server/api/root.ts` | 路由配置根 |
| 认证配置 | `/web/src/server/auth.ts` | NextAuth 配置 |
| Worker 入口 | `/worker/src/index.ts` | Express 服务启动 |
| 数据库客户端 | `/packages/shared/src/db.ts` | Prisma 客户端 |
| 数据库模型 | `/packages/shared/prisma/schema.prisma` | 数据模型定义 |
| 环境验证 | `/web/src/env.mjs` | 环境变量验证 |
