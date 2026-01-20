#!/bin/bash

echo "🚀 启动 LangFuse Trace 集成服务"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查后端依赖
if [ ! -d "backend/node_modules" ]; then
    echo "📦 安装后端依赖..."
    cd backend
    npm install
    cd ..
fi

# 检查环境变量文件
if [ ! -f "backend/.env" ]; then
    echo "⚠️  未找到 backend/.env 文件"
    echo "请复制 backend/.env.example 到 backend/.env 并配置正确的 API 密钥"
    echo ""
    echo "示例配置："
    echo "LANGFUSE_BASE_URL=https://cloud.langfuse.com"
    echo "LANGFUSE_API_KEY=your_api_key_here"
    echo "LANGFUSE_PROJECT_ID=your_project_id_here"
    echo "PORT=3001"
    exit 1
fi

echo "🔧 启动后端服务器..."
cd backend
npm start &
BACKEND_PID=$!

echo "🌐 启动前端服务器..."
cd ../frontend
if command -v python3 &> /dev/null; then
    python3 -m http.server 8080 &
    FRONTEND_PID=$!
elif command -v python &> /dev/null; then
    python -m http.server 8080 &
    FRONTEND_PID=$!
else
    echo "⚠️  未找到 Python，使用浏览器直接打开 frontend/index.html"
    FRONTEND_PID=""
fi

cd ..

echo ""
echo "✅ 服务启动完成！"
echo "📊 后端 API: http://localhost:3001"
echo "🖥️  前端界面: http://localhost:8080"
echo ""
echo "按 Ctrl+C 停止服务"

# 等待用户中断
trap "echo '🛑 正在停止服务...'; kill $BACKEND_PID 2>/dev/null; [ -n '$FRONTEND_PID' ] && kill $FRONTEND_PID 2>/dev/null; exit 0" INT

wait