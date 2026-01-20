#!/bin/bash

echo "🔍 LangFuse 配置测试脚本"
echo "==========================="

# 获取当前配置
BACKEND_URL="http://localhost:3007"
LANGFUSE_URL="https://cloud.langfuse.com"
API_KEY="sk-lf-6ee640f6-d3b9-4262-9d8e-2182c67a7c7d"
PROJECT_ID="cmk4ryq3r0007ql073wa3tuvx"

echo ""
echo "📋 当前配置:"
echo "后端服务器: ${BACKEND_URL}"
echo "LangFuse API: ${LANGFUSE_URL}"
echo "项目 ID: ${PROJECT_ID}"
echo "API 密钥: ${API_KEY:0:20}..."

echo ""
echo "1. 测试后端服务器健康状态..."
if curl -s "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
    echo "✅ 后端服务器运行正常"
else
    echo "❌ 后端服务器未运行"
    echo "请先启动后端: cd backend && PORT=3006 npm start"
    exit 1
fi

echo ""
echo "2. 测试 LangFuse API 连接..."
response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    "${LANGFUSE_URL}/api/public/traces?projectId=${PROJECT_ID}&page=1&limit=1")

http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
api_response=$(echo "$response" | grep -v "HTTP_STATUS:")

echo "HTTP 状态码: $http_status"
if [ "$http_status" = "200" ]; then
    echo "✅ LangFuse API 连接成功"
    echo "📊 API 响应示例:"
    echo "$api_response" | head -c 200
    echo "..."
else
    echo "❌ LangFuse API 连接失败"
    echo "API 响应: $api_response"
    echo ""
    echo "🔧 故障排除建议:"
    echo "1. 检查 API 密钥是否正确"
    echo "2. 确认 PROJECT_ID 是否匹配您的 LangFuse 项目"
    echo "3. 验证您是否对该项目有访问权限"
    echo "4. 检查 LangFuse 服务状态"
    echo ""
    echo "💡 提示: 您可以访问 https://cloud.langfuse.com 检查您的项目设置"
fi

echo ""
echo "3. 测试前端页面..."
if curl -s http://localhost:8080/ | grep -q "LangFuse Trace"; then
    echo "✅ 前端页面正常加载"
else
    echo "❌ 前端页面加载失败"
fi

echo ""
echo "🌐 访问地址:"
echo "前端界面: http://localhost:8080"
echo "配置向导: http://localhost:8080/config.html"
echo "后端 API: ${BACKEND_URL}"

echo ""
echo "🎯 状态总结:"
if [ "$http_status" = "200" ]; then
    echo "🎉 配置成功！您可以开始使用 LangFuse Trace 监控了"
else
    echo "⚠️  需要解决 API 连接问题才能完全使用"
fi

echo ""
echo "2. 测试 LangFuse API 连接..."
response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    "${LANGFUSE_URL}/api/public/projects")

http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
api_response=$(echo "$response" | grep -v "HTTP_STATUS:")

echo "HTTP 状态码: $http_status"
echo "API 响应: $api_response"

if [ "$http_status" = "200" ]; then
    echo "✅ LangFuse API 连接成功"

    # 尝试解析项目信息
    project_id=$(echo "$api_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$project_id" ]; then
        echo "📋 发现项目 ID: $project_id"
        echo ""
        echo "🔧 自动更新配置..."
        sed -i "s/your_project_id_here/$project_id/" ../backend/.env
        echo "✅ 配置已更新，请重启后端服务器"
        echo ""
        echo "重启命令: cd backend && npm start"
    else
        echo "⚠️ 无法自动获取项目 ID"
    fi
else
    echo "❌ LangFuse API 连接失败"
    echo ""
    echo "可能的解决方案:"
    echo "1. 检查 API 密钥是否正确"
    echo "2. 检查 LangFuse 服务器地址"
    echo "3. 确认 LangFuse 服务正在运行"
    echo "4. 手动提供 PROJECT_ID"
    echo ""
    echo "手动配置方法:"
    echo "编辑 backend/.env 文件，将 'your_project_id_here' 替换为实际的项目 ID"
fi

echo ""
echo "3. 测试前端页面..."
if curl -s http://localhost:8080/ | grep -q "LangFuse Trace"; then
    echo "✅ 前端页面正常加载"
else
    echo "❌ 前端页面加载失败"
fi

echo ""
echo "📋 当前配置状态:"
echo "后端服务器: ${BACKEND_URL}"
echo "LangFuse API: ${LANGFUSE_URL}"
echo "前端页面: http://localhost:8080"

echo ""
echo "🎯 下一步操作:"
if [ "$http_status" = "200" ] && [ -n "$project_id" ]; then
    echo "1. 重启后端服务器以应用新配置"
    echo "2. 访问 http://localhost:8080 开始使用"
else
    echo "1. 获取正确的 PROJECT_ID"
    echo "2. 更新 backend/.env 文件"
    echo "3. 重启后端服务器"
fi