#!/bin/bash

# 同步GitLab项目到本地数据库的脚本

CONNECTION_ID="e0125103-235d-4ff8-a09e-23735f064798"
API_URL="http://localhost:3000/api/gitlab/connections/$CONNECTION_ID/sync-projects"

echo "🔄 正在同步GitLab项目..."
echo "连接ID: $CONNECTION_ID"
echo ""

# 直接触发同步（不需要认证）
response=$(curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")

http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_STATUS:")

if [ "$http_status" = "200" ] || [ "$http_status" = "201" ]; then
  echo "✅ 同步成功!"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo "❌ 同步失败 (HTTP $http_status)"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
fi