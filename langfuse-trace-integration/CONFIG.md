# LangFuse Trace 集成配置

## 当前服务器配置

BACKEND_URL=http://192.168.0.197:3000
FRONTEND_URL=http://localhost:8080

## LangFuse API 配置

LANGFUSE_BASE_URL=https://cloud.langfuse.com

# 请在 .env 文件中设置以下变量：

# LANGFUSE_API_KEY=your_api_key_here

# LANGFUSE_PROJECT_ID=your_project_id_here

## 部署说明

1. 确保后端服务器运行在 192.168.0.197:3000
2. 配置正确的 LangFuse API 密钥和项目 ID
3. 启动前端服务器（例如 python -m http.server 8080）
4. 在浏览器中访问前端页面
