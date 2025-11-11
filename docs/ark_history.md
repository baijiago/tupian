# 图片识别接入（火山引擎 Ark）实施历史与说明

> 目标：实现“上传图片 → 调用火山引擎 Ark 多模态 Chat Completions → 展示 API 响应”的本地可运行方案，并沉淀为可复用脚手架。

## 时间线

- 明确需求与鉴权方式
  - 确认使用 Ark v3 Chat Completions（多模态），`Authorization: Bearer {API_KEY}`。
  - 约定将密钥写入 `.env.local`；变量名为 `VOLC_API_KEY` 与（兼容）`ARK_API_KEY`。
- 环境与项目初始化
  - 创建文件：`.env.local`、`.env.example`、更新 `.gitignore` 忽略 `.env.local`。
  - 选择 Python 3.11（路径：`C:\Users\86147\AppData\Local\Programs\Python\Python311\python.exe`）。
  - 提供“零依赖”CLI（标准库）先打通 API 调用。
- 后端与前端
  - 新建 FastAPI 服务，上传接口 `POST /api/recognize`，主页 `GET /`（多图上传，展示 JSON）。
  - 集成 Ark HTTP 客户端，按要求以 `data:image/{fmt};base64,{...}` 传图。
- 依赖安装与运行
  - 一键脚本 `scripts/setup.ps1`（创建 `.venv`，安装 `requirements.txt`）。
  - 启动脚本 `scripts/serve.ps1` 启动服务。
- 问题排查与修复
  - 初始使用的 `model: ep-20250921140145-v9tg9` 返回 `InvalidEndpoint.ClosedEndpoint`（端点关闭/不可用）。
  - 页面加入“模型ID”输入框；支持 per-request 覆盖 `model`。
  - 设置默认 `ARK_MODEL_ID=doubao-seed-1-6-251015` 后获得有效结果。
  - 修复 HTML 字符串插值易引发语法问题，改用模板占位（避免 f-string 与 `{}` 冲突）。
- 状态确认
  - 服务可用：上传图片后可见 Ark 返回的原始 JSON；你确认“有结果了”。

## 文件与结构

- 后端
  - `app/main.py`：FastAPI 应用，路由 `GET /`、`POST /api/recognize`
  - `app/ark_client.py`：Ark HTTP 客户端（标准库 `urllib`）
- CLI（零依赖直调）
  - `scripts/ark_cli.py`：输入图片路径与提示词，直接调用 Ark 并打印 JSON
- 运行脚本与依赖
  - `scripts/setup.ps1`：创建 `.venv`、升级 pip、安装依赖
  - `scripts/serve.ps1`：从 `.venv` 启动 uvicorn 服务
  - `requirements.txt`：`fastapi`, `uvicorn`, `python-multipart`
- 配置
  - `.env.local`：存放密钥与默认模型（不纳入版本控制）
  - `.env.example`：示例变量占位
  - `.gitignore`：忽略 `.env.local`

## 鉴权与配置

- `.env.local`（示例）
  ```ini
  VOLC_API_KEY=60bdb430-739e-4979-9830-f2b22dede1ef
  ARK_API_KEY=60bdb430-739e-4979-9830-f2b22dede1ef
  ARK_MODEL_ID=doubao-seed-1-6-251015
  ```
- 说明
  - `ARK_API_KEY` 与 `VOLC_API_KEY` 任一存在即可。
  - 模型字段 `model` 支持两类：
    - 端点 ID：`ep-...`（需控制台启用且处于可用状态）
    - 模型名：如 `doubao-seed-1-6-251015`（你提供的示例已验证可用）
  - 接口地域为北京：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`

## API 请求格式（对齐与注意事项）

- HTTP
  - URL：`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`
  - 头：`Authorization: Bearer {API_KEY}`，`Content-Type: application/json`
- 消息体（OpenAI 风格）
  - 单条 `user` 消息内，`content` 包含文本块和图片块
  - 图片块以 data URL 或公网 URL 传递
- data URL 必须使用半角 ASCII 标点（重点）
  - 正确：`data:image/png;base64,xxxx`
  - 错误（全角）：`data:image/png；base64，xxxx`
- 示例（data URL）
  ```json
  {
    "model": "doubao-seed-1-6-251015",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "图片主要讲了什么?" },
          { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,BASE64_BYTES" } }
        ]
      }
    ]
  }
  ```
- 示例（公网 URL）
  ```json
  {
    "model": "doubao-seed-1-6-251015",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "image_url", "image_url": { "url": "https://ark-project.tos-cn-beijing.ivolces.com/images/view.jpeg" } },
          { "type": "text", "text": "图片主要讲了什么?" }
        ]
      }
    ],
    "reasoning_effort": "medium",
    "max_completion_tokens": 65535
  }
  ```

## 使用方法

- 一键安装（需联网）
  ```powershell
  cd D:\code\tupian
  .\scripts\setup.ps1
  ```
- 启动服务
  ```powershell
  # 可选覆盖一次默认模型
  $env:ARK_MODEL_ID = "doubao-seed-1-6-251015"
  .\scripts\serve.ps1
  # 访问 http://127.0.0.1:8000
  ```
- 页面使用
  - 选择图片 → 填写提示词/模型ID（可空，默认取 `.env.local`） → 上传并识别
  - 页面展示 Ark 的原始 JSON 响应
- 命令行直测（不依赖 FastAPI）
  ```powershell
  .\.venv\Scripts\python.exe scripts\ark_cli.py "D:\\path\\to\\image.jpg" "图片主要讲了什么?"
  ```

## 已解决问题与关键决策

- 端点不可用
  - `model: ep-20250921140145-v9tg9` 返回 `InvalidEndpoint.ClosedEndpoint`（端点关闭/不可用）
  - 方案：允许在页面输入 `model`；默认改为 `doubao-seed-1-6-251015`（已验证可用）
- data URL 标点
  - 修正为半角 `;` 和 `,`，避免 JSON/网关解析错误
- HTML 模板与 Python 字符串插值
  - 避免 f-string 与 `{}` 冲突，改用模板占位替换
- Python 环境
  - 选择 3.11，创建 `.venv`，集中管理依赖与运行

## 接口与代码概览

- 路由
  - `GET /`：上传页面（多图、多字段）
  - `POST /api/recognize`：接收上传文件 → 转 `data:image/*;base64,...` → 调用 Ark → 返回聚合 JSON
- 主要代码
  - `app/ark_client.py`：`ark_vision_chat(api_key, model, prompt, image_bytes, mime)` 打包请求，处理 HTTP/JSON 错误
  - `app/main.py`：
    - 载入 `ARK_API_KEY`/`VOLC_API_KEY` 与 `DEFAULT_MODEL`
    - `imghdr` 做基本图片校验
    - 支持表单字段 `model` 覆盖默认模型

## 故障排查简表

- 401/403：检查 API Key 是否正确、是否放到 `.env.local`；确认地域与权限
- 400 且 `InvalidEndpoint.ClosedEndpoint`：更换为有效的 `ep-...` 或直接用模型名（如 `doubao-seed-1-6-251015`）
- 415：文件不是有效图片或 MIME 错误
- 页面打不开或 8000 被占用
  - 改端口：`.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001`
  - 查看错误日志：`Get-Content .\uvicorn.err.log -Tail 100`

## 安全与配置

- `.env.local` 已加入 `.gitignore`，避免密钥入库
- 建议在生产环境改为系统级环境变量或安全密钥管理工具
- 上传接口当前仅做基本图片校验；如需更严格（大小/类型/并发/EXIF 清理）可继续增强

## 下一步建议

- 结果展示优化：从原始 JSON 中抽取关键信息并结构化展示
- 错误提示友好化：鉴权失败、端点不可用、图片不合法等
- 缓存/队列：批量上传与识别任务异步化，UI 轮询进度
- 记录与审计：保存请求与响应摘要、去重、缩略图生成（选配）

