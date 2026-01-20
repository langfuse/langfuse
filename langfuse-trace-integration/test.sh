#!/bin/bash

echo "🧪 测试 LangFuse Trace 集成"

BACKEND_URL="http://localhost:3001"

# 测试后端健康检查
echo "🔍 测试后端健康检查..."
if curl -s "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
    echo "✅ 后端服务运行正常"
else
    echo "❌ 后端服务未运行，请先启动后端服务"
    echo "运行: cd backend && npm start"
    exit 1
fi

# 测试 API 连接
echo "🔍 测试 API 连接..."
response=$(curl -s "${BACKEND_URL}/api/traces?page=1&limit=1")
if echo "$response" | grep -q "error"; then
    echo "❌ API 连接失败，请检查配置"
    echo "响应: $response"
    exit 1
else
    echo "✅ API 连接正常"
fi

# 测试前端文件
echo "🔍 检查前端文件..."
if [ -f "frontend/index.html" ] && [ -f "frontend/styles.css" ] && [ -f "frontend/app.js" ]; then
    echo "✅ 前端文件完整"
else
    echo "❌ 前端文件缺失"
    exit 1
fi

echo ""
echo "🎉 所有测试通过！"
echo ""
echo "现在可以访问以下地址："
echo "📊 后端 API: ${BACKEND_URL}"
echo "🖥️  前端界面: http://localhost:8080 (需要启动前端服务器)"
echo ""
echo "如果前端未启动，运行以下命令之一："
echo "python3 -m http.server 8080  # Python 3"
echo "python -m http.server 8080   # Python 2"
echo "npx serve frontend -p 8080   # Node.js"