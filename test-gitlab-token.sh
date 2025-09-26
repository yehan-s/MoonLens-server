#!/bin/bash

echo "请输入你的 GitLab Personal Access Token:"
read -s GITLAB_TOKEN

echo -e "\n测试 GitLab 连接..."

# 测试 Token 是否有效
response=$(curl -s -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  http://gitlab.sunyur.com/api/v4/user)

if echo "$response" | grep -q '"id"'; then
  echo "✅ Token 有效！用户信息："
  echo "$response" | jq '{id, username, name, email, state}'
  
  echo -e "\n现在创建 MoonLens 连接..."
  
  # 获取 JWT Token
  JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2M2JlOWVjOC01NzIxLTQwYTgtYjAxNi1kNmIwNzdjZDZiMzYiLCJlbWFpbCI6ImdpdGxhYi10ZXN0QG1vb25sZW5zLmNvbSIsInJvbGUiOiJVU0VSIiwianRpIjoiYzBlZWU4MjYtN2E2OC00ZTcyLWIyZDAtMjNkOTQ1MWMyNGY4IiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc1ODgyMDQ4NSwiZXhwIjoxNzU4ODIxMDg5fQ.tdeAfiVVcr60gNLKpqXrsm4gjf0VyUjBM-DgWwPS24Q"
  
  # 创建连接
  curl -X POST http://localhost:3000/api/gitlab/connections \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"Sunyur GitLab\",
      \"gitlabUrl\": \"http://gitlab.sunyur.com\",
      \"accessToken\": \"$GITLAB_TOKEN\"
    }" | jq
else
  echo "❌ Token 无效或 GitLab 服务器无法访问"
  echo "响应: $response"
fi
