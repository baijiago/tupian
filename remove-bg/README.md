# 抠图去背景 功能需求文档

## 概述
- 目标：提供“上传图片 → 去除背景 → 下载结果”的完整闭环，前端不暴露 API Key，后端代理 remove.bg。
- 场景：电商主图抠图、证件照替换背景、人物/物品抠图。
- 语言与风格：页面为中文，简洁明了、易用。

## 现有项目结构
- 前端页面：emove-bg/index.html
- 静态资源：ssets/styles.css
- 后端服务：server/index.js（Express 静态站点 + API 代理）
- 环境配置：.env、.env.example
- 根入口：index.html（包含入口链接至 remove-bg）

## 功能需求

- 上传图片
  - 支持拖拽/点击选择单张图片
  - 类型限制：image/*
  - 大小限制：≤ 25MB（与后端一致）
  - 选择后即时在右侧展示“原图预览”（本地预览，不上传）

- 参数选择
  - 输出尺寸：uto | preview | small | medium | hd | 4k（默认 uto）
  - 背景模式：
    - 	ransparent：透明（默认）
    - color：纯色（HEX，不含 #）
    - image：图片 URL（http/https）

- 去除背景
  - 点击“去背景”按钮后禁用按钮并显示“处理中…”
  - 使用 multipart/form-data 调用后端 /api/remove-bg
  - 成功后展示“抠图结果预览”并显示“下载”按钮
  - 失败时保留原图预览并提示错误

- 保存结果
  - 下载按钮基于返回二进制 Blob URL，一键保存
  - 文件名：原名-no-bg.(png|webp|jpg)（按响应 Content-Type 决定扩展名）

## 交互流程
1. 用户拖拽/选择图片 → 前端立即显示原图预览（本地）
2. 选择尺寸与背景模式（透明/纯色/图片 URL）
3. 点击“去背景” → 前端提交表单至后端
4. 后端携带 API Key 代理调用 remove.bg
5. 后端返回抠图结果二进制 → 前端显示结果并提供下载

## 前端需求（emove-bg/index.html）
- UI
  - 上传区域（拖拽/点击）
  - 参数区：尺寸选择、背景模式选择、颜色选择器或 URL 输入框（联动显隐）
  - 预览区：初始提示 → 原图预览 → 抠图结果预览
  - 操作区：去背景按钮、下载按钮（初始隐藏）
- 行为
  - 文件校验（类型、大小）、错误提示
  - 预览使用 URL.createObjectURL，切换文件时 URL.revokeObjectURL
  - 去背景时按钮禁用+加载态
  - 按背景模式附带 g_color 或 g_image_url
  - 成功后显示下载按钮并设置动态文件名
- 无需暴露 API Key；所有请求走后端代理

## 后端需求（server/index.js）
- 提供静态文件服务（项目根）
- 健康检查：GET /health → { ok: true }
- 抠图代理：POST /api/remove-bg
  - 使用 multer.memoryStorage() 接收 image_file
  - 读取环境变量 REMOVE_BG_API_KEY
  - 向 https://api.remove.bg/v1.0/removebg 转发 multipart：
    - image_file（Buffer）
    - size
    - 可选 g_color（HEX，无 #）
    - 可选 g_image_url
  - 响应：
    - 成功：200 + 二进制（透传 Content-Type，默认 image/png），Cache-Control: no-store
    - 失败：非 200 → JSON { error: 'remove.bg error', detail: string }
- 限制：单文件 ≤ 25MB（multer 限制）

## 配置与环境
- .env：
  - REMOVE_BG_API_KEY=你的密钥
  - PORT=8787（可选）
- 本地运行：
  - 
pm start 或 
pm run dev → http://localhost:8787
- 安全：API Key 仅在服务端读取；前端不暴露

## API 接口规范

- 前端 → 后端
  - POST /api/remove-bg（multipart/form-data）
    - image_file：必填，文件，image/*，≤25MB
    - size：可选，uto|preview|small|medium|hd|4k，默认 uto
    - g_color：可选，HEX（不含 #）
    - g_image_url：可选，http/https URL
  - 成功：200，Content-Type: image/* 二进制
  - 失败：JSON { error: string, detail?: string }

- 后端 → remove.bg
  - URL：POST https://api.remove.bg/v1.0/removebg
  - Header：X-Api-Key: 
  - Body：同上
  - 成功：二进制图片；失败：错误文本（后端封装为 JSON）

- 规则
  - g_color 与 g_image_url 二选一；都不传 = 透明背景
  - 优先返回 PNG（透明），服务端按原样透传

## 错误处理
- 前端
  - 非图片/超限 → 本地提示，不发请求
  - 请求失败 → 弹窗错误并恢复按钮；保留原图预览
- 后端
  - 缺少 API Key → 500 { error: 'Server missing REMOVE_BG_API_KEY' }
  - 未上传文件 → 400 { error: 'image_file is required' }
  - 上游非 200 → 透出状态码与 detail

## 安全与隐私
- 不在前端暴露 API Key
- 默认不在服务器持久化用户图片或结果（内存转发）
- 添加 Cache-Control: no-store 禁止缓存结果

## 性能与限制
- 文件大小 ≤ 25MB
- 单请求串行处理；必要时可加队列或并发限制
- 预览与结果展示采用 Blob URL，避免冗余内存占用

## 兼容性
- 现代浏览器（支持 FormData、URL.createObjectURL、etch）
- 退化方案不考虑 IE

## 日志与监控
- 后端记录错误日志（状态码、错误摘要）
- /health 供存活检查

## 验收标准
- 能在 emove-bg/ 页面完成：
  - 选择/拖拽图片后立即看到原图预览
  - 可选择尺寸与背景模式（纯色/图片 URL 联动显示）
  - 点击“去背景”后成功得到结果预览与可下载文件
  - 失败时有明确提示，按钮与页面状态恢复
- 后端：
  - 缺 Key、缺文件、上游错误时返回相应 JSON
  - 成功请求返回正确 Content-Type 和二进制内容

## 手工联调与测试

- curl（本地到后端）
  `
  curl -X POST http://localhost:8787/api/remove-bg ^
    -F "image_file=@C:\path\to\img.jpg" ^
    -F "size=auto" ^
    -F "bg_color=ffffff" ^
    -o no-bg.png
  `

- PowerShell（直接到 remove.bg，用于快速验证 Key）
  `
  ="..."; ="C:\path\to\img.jpg"; ="no-bg.png"
  curl.exe -H "X-API-Key: " 
           -F "image_file=@" 
           -F "size=auto" 
           -f https://api.remove.bg/v1.0/removebg 
           -o 

  if ( -eq 0) { Write-Host "背景去除成功！输出文件: " }
  else { Write-Host "操作失败，请检查图片路径和API密钥" }
  `

## 可选增强（后续）
- 服务端可选持久化结果到 outputs/ 并返回下载链接
- 批量处理与队列显示
- 历史结果列表（仅本地 IndexedDB）
- 允许用户调节前景细节保留程度（上游参数支持时）
- 多语言切换与无障碍优化