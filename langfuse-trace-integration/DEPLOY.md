# 🚀 快速部署指南

## 后端服务器配置 (192.168.0.197:3000)

### 1. 准备工作

```bash
# 进入后端目录
cd langfuse-trace-integration/backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
```

### 2. 编辑 .env 文件

```env
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_API_KEY=你的_langfuse_api_key
LANGFUSE_PROJECT_ID=你的项目_id
PORT=3000
```

### 3. 启动后端服务器

```bash
# 开发模式
npm run dev

# 或生产模式
npm start
```

## 前端部署

### 方法1: 使用Python简单服务器

```bash
cd langfuse-trace-integration/frontend
python3 -m http.server 8080
# 访问: http://localhost:8080
```

### 方法2: 使用Node.js服务器

```bash
npm install -g serve
cd langfuse-trace-integration/frontend
serve -p 8080
# 访问: http://localhost:8080
```

### 方法3: 部署到Web服务器

将 `frontend/` 目录下的所有文件复制到您的Web服务器目录。

## 验证部署

### 1. 测试后端连接

```bash
curl http://192.168.0.197:3000/api/health
# 应该返回: {"status":"OK","timestamp":"..."}
```

### 2. 测试前端界面

在浏览器中访问前端地址，应该能看到：

- LangFuse Trace 监控界面
- 绿色的"已连接"状态指示器
- Trace 列表（如果有数据）

## 故障排除

### 如果后端连接失败

1. 确认后端服务器正在运行在 192.168.0.197:3000
2. 检查防火墙设置
3. 验证 API 密钥和项目 ID

### 如果前端显示空白

1. 检查浏览器控制台的错误信息
2. 确认后端URL配置正确
3. 检查跨域请求设置

### 如果没有数据显示

1. 确认 LangFuse 项目中有 trace 数据
2. 检查时间过滤器设置
3. 查看后端服务器日志

## 生产部署建议

1. **安全配置**: 使用 HTTPS 和安全的 API 密钥管理
2. **监控**: 设置服务器监控和日志收集
3. **备份**: 定期备份配置文件和数据
4. **更新**: 及时更新依赖包和安全补丁

## 联系支持

如果遇到问题，请检查：

- README.md 中的详细文档
- CONFIG.md 中的配置说明
- 浏览器开发者工具的网络和控制台标签
