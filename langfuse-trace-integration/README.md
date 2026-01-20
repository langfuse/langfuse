# LangFuse Trace 监控集成

这是一个将 LangFuse 的后台监控 trace 内容集成到其他系统页面的完整解决方案。

## 功能特性

- ✅ **轻量化前端UI**：纯 HTML/CSS/JS，无框架依赖
- ✅ **完整后端集成**：Express 服务器 + LangFuse REST API
- ✅ **实时监控**：Trace 列表和详情查看
- ✅ **高级过滤**：多维度智能过滤系统
  - 全文搜索（名称/ID）
  - 专门的 trace 名称过滤
  - 用户 ID 过滤
  - 时间范围过滤
  - 实时过滤（演示模式）
- ✅ **响应式设计**：支持桌面和移动设备
- ✅ **错误处理**：完善的错误提示和重试机制

## 快速开始

### 1. 获取 LangFuse API 密钥

1. 访问 [LangFuse Cloud](https://cloud.langfuse.com)
2. 创建新项目或选择现有项目
3. 在项目设置中创建 API 密钥
4. 记录项目 ID 和 API 密钥

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件：

```env
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_API_KEY=your_api_key_here
LANGFUSE_PROJECT_ID=your_project_id_here
PORT=3000
```

**注意**: 前端已配置为连接到后端服务器 `http://192.168.0.197:3000`。如果您需要更改后端地址，请修改 `frontend/app.js` 文件中的 `backendUrl` 配置。

### 3. 启动服务

```bash
# 安装后端依赖
cd backend
npm install

# 启动后端服务器
npm start

# 在另一个终端启动前端
cd ../frontend
python -m http.server 8080  # 或使用其他静态服务器
```

### 4. 访问应用

打开浏览器访问前端页面（例如 `http://localhost:8080` 或您的前端服务器地址）查看集成界面。

## 项目结构

```
langfuse-trace-integration/
├── backend/                 # 后端服务
│   ├── server.js           # Express 服务器
│   ├── langfuse-client.js  # LangFuse API 客户端
│   ├── package.json        # 后端依赖
│   └── .env.example        # 环境变量示例
├── frontend/               # 前端界面
│   ├── index.html          # 主页面
│   ├── styles.css          # 样式文件
│   └── app.js             # 前端逻辑
└── README.md              # 本文档
```

## API 接口

### 后端 API 端点（运行在 192.168.0.197:3000）

- `GET /api/health` - 健康检查
- `GET /api/traces` - 获取 Trace 列表
  - 查询参数：`page`, `limit`, `searchQuery`, `userId`, `fromTimestamp`, `toTimestamp`
- `GET /api/traces/:traceId` - 获取单个 Trace 详情
- `GET /api/metrics/traces` - 获取 Trace 指标

### LangFuse API 集成

后端通过以下 LangFuse REST API 端点获取数据：

- `/api/public/traces` - Trace 列表和搜索
- `/api/public/traces/{traceId}` - Trace 详情（包含观察和评分）
- `/api/public/metrics/traces` - Trace 指标和统计

## 开发指南

### 添加新功能

1. **前端功能**：在 `app.js` 中添加方法，在 `index.html` 中添加 UI 元素
2. **后端功能**：在 `server.js` 中添加路由，在 `langfuse-client.js` 中添加 API 方法
3. **样式优化**：在 `styles.css` 中添加相应的样式规则

### 自定义配置

- **API 端点**：修改 `server.js` 中的路由
- **UI 主题**：修改 `styles.css` 中的颜色变量
- **数据格式**：调整 `app.js` 中的数据渲染逻辑

### 部署说明

#### 开发环境

```bash
# 后端
cd backend && npm run dev

# 前端
cd frontend && python -m http.server 8080
```

#### 生产环境

```bash
# 后端部署到服务器 (192.168.0.197:3000)
cd backend
npm install --production
NODE_ENV=production npm start

# 前端部署到 CDN 或静态服务器
# 复制 frontend/ 目录到 web 服务器
```

## 故障排除

### 常见问题

1. **连接失败**
   - 检查 `.env` 文件中的 API 密钥是否正确
   - 确认 LangFuse 服务是否可访问
   - 检查防火墙和网络设置

2. **无数据显示**
   - 确认项目中有 trace 数据
   - 检查时间范围过滤器
   - 查看浏览器控制台错误信息

3. **性能问题**
   - 启用分页加载大量数据
   - 实现数据缓存机制
   - 优化 API 请求频率

### 调试技巧

- 打开浏览器开发者工具查看网络请求
- 检查后端服务器日志
- 使用 `console.log` 在关键位置添加调试信息

## 扩展功能

### 计划中的功能

- [ ] 实时 WebSocket 连接
- [ ] 高级图表可视化
- [ ] Trace 对比功能
- [ ] 导出功能（PDF/Excel）
- [ ] 用户权限管理
- [ ] 多项目支持

### 自定义集成

如果需要更深入的集成，可以：

1. 使用 LangFuse 的 tRPC 客户端替代 REST API
2. 集成到现有 React/Vue/Angular 应用中
3. 添加自定义的监控指标和告警
4. 实现自动化测试和 CI/CD 集成

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如果遇到问题，请：

1. 查看本文档的故障排除部分
2. 检查 [LangFuse 文档](https://langfuse.com/docs)
3. 在 GitHub 上提交 Issue
