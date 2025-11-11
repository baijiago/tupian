# 生图（图像生成）实现与测试历史（仅关乎生图）

> 备注：本文档仅记录“生图/图像生成”相关的实现与联调测试历史，不包含识别（recognize）、去背景（remove‑bg）、压缩（compress）等其它功能模块。

## 目标

- 在本地通过前端页面 `/generate/` 与后端路由 `POST /api/generate` 打通到火山引擎 Ark 图像生成 API（Images Generations），完成端到端生图。
- 记录关键环境配置、测试步骤、遇到的问题与结论，便于后续复现与排错。

## 代码位置

- 后端（Node + Express）：`server/index.js`
  - 路由：`POST /api/generate`（转发到 Ark Images Generations）
  - 健康检查：`GET /health`
  - 静态资源：从仓库根目录提供（因此 `/generate/` 可直接访问前端页面）
- 前端页面：`generate/index.html`
  - 表单字段映射到 `POST /api/generate` 的 JSON 请求体，支持 `prompt/n/size/model/response_format/sequential_image_generation/stream/watermark/negative_prompt` 等。
- 示例与配置：`.env.example`、`.env.local`

## 运行与访问

- 安装依赖（已安装可跳过）：
  ```powershell
  npm i
  ```
- 启动后端（避免占用既有 8787 实例，使用 8790）：
  ```powershell
  $env:PORT = '8790'
  node server/index.js
  ```
- 自检：
  - `GET http://127.0.0.1:8790/health` → `{ ok: true }`
  - `GET http://127.0.0.1:8790/generate/` → 返回生图页面（200）

## 环境变量与密钥

- 需要至少其一：`ARK_API_KEY` 或 `VOLC_API_KEY`（两者等价，任取其一）
- 建议将“聊天模型”和“生图模型”分离：
  - 聊天默认：`ARK_MODEL_ID`（供识别/对话使用）
  - 生图默认：`ARK_IMAGE_MODEL_ID`（供 `/api/generate` 使用）
- 可选：自定义生图接口基址（默认北京）：
  - `ARK_IMAGE_API_BASE`（默认 `https://ark.cn-beijing.volces.com/api/v3/images/generations`）
- 推荐 `.env.local` 示例：
  ```ini
  VOLC_API_KEY=你的_API_Key
  ARK_API_KEY=你的_API_Key
  
  # 聊天模型（非生图）
  ARK_MODEL_ID=doubao-seed-1-6-251015
  
  # 生图模型（重点：需支持 Images Generations）
  ARK_IMAGE_MODEL_ID=ep-xxxxxxxxxxxxxxxxxxxxxxxx   
  # ARK_IMAGE_API_BASE=https://ark.cn-beijing.volces.com/api/v3/images/generations
  ```

## 测试过程纪要

- 端口占用与切换
  - 发现 8787 端口已有旧进程：`node server/index.js`，返回 `Cannot POST /api/generate`（旧版本未包含该路由）。
  - 为不干扰既有服务，改用 `PORT=8790` 启动当前后端。`/health` 正常，`/generate/` 页面可访问。
- 外网与路由连通性
  - 调用 `POST /api/generate` 能收到来自 Ark 的错误详情，说明外网畅通且已真正命中 Ark。
- 两次关键调用与结果
  1) 显式指定聊天模型：`model = "doubao-seed-1-6-251015"`
     - Ark 返回 `InvalidParameter`：提示该模型不支持图像生成。
  2) 不指定 `model`（期望后端使用默认模型）
     - Ark 返回 `InvalidEndpointOrModel.NotFound`：需要明确可用的“生图模型或 Endpoint”。
- 结论
  - 生图端到端链路（页面 → 本地后端 → Ark）已经打通；
  - 当前失败原因是“模型不匹配/未授权”。需要提供一个支持 Images Generations 的有效模型或 endpoint（如 `ep-...`）。

## 推荐做法与注意事项

- 明确区分默认模型：
  - 将 `/api/generate` 的默认模型仅从 `ARK_IMAGE_MODEL_ID` 读取，避免误用聊天模型 `ARK_MODEL_ID`。
- 前端页面中 `model` 字段留空时，后端应优先使用 `ARK_IMAGE_MODEL_ID`；如为空，则明确返回“缺少生图模型”的提示，避免误导。
- 响应格式选择
  - `response_format`: `url`（默认，便于预览/下载）或 `b64_json`（内联 base64）。
- CORS/缓存
  - 后端已设 `Cache-Control: no-store`，页面端也禁用缓存，便于调试。

## 本地复现实操（命令）

- 发起一次生图（PowerShell）：
  ```powershell
  $body = @{ 
    prompt = '一只在海边日出的黄色小猫，电影级光影，超清'
    n = 1
    size = '2K'
    response_format = 'url'
    # 建议：不在此处使用聊天模型；若需覆盖，请填可用的生图模型
    model = 'ep-xxxxxxxxxxxxxxxxxxxxxxxx'
    watermark = $true
  } | ConvertTo-Json -Depth 5 -Compress

  Invoke-RestMethod -Uri 'http://127.0.0.1:8790/api/generate' `
    -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 120
  ```
- 成功返回期望：
  ```json
  {
    "ok": true,
    "model": "ep-...",
    "images": ["https://..."],      // 或 "data:image/png;base64,..."
    "raw": { /* Ark 原始响应 */ }
  }
  ```

## 常见问题排查

- 端口被占用：
  - `netstat -ano | Select-String ":8787"` 查 PID；必要时更换端口或停止旧进程。
- 返回 `InvalidParameter`：
  - 传入了聊天模型（如 `doubao-seed-1-6-251015`），非生图模型；改为具有生成权限的生图模型或 endpoint。
- 返回 `InvalidEndpointOrModel.NotFound`：
  - 未指定 `model` 且后端未配置 `ARK_IMAGE_MODEL_ID`，或当前账号对目标模型无访问权限。
- 无法访问外网：
  - 生图依赖 Ark 外网；若在受限环境需放行目标域名 `ark.cn-beijing.volces.com`。

## 下一步

- 提供一个可用的生图模型/endpoint（`ARK_IMAGE_MODEL_ID`），我方将复测并截图核验 `/generate/` 页面展示效果。
- 可选代码优化：将后端默认模型来源严格限定为 `ARK_IMAGE_MODEL_ID`，并在缺失时返回明确报错。

---

最后更新：由代理在本地验证链路后整理（仅关乎生图）。
