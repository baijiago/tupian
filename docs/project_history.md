# 项目交互与改造历史（生图 + Vercel 部署）

> 目的：让新接手同学快速了解近期在“生图”功能与 Vercel 部署方面做过的事情、遇到的问题与解决方案。仅涵盖本次协作范围。

## 概览

- 技术栈：静态页面 + Node/Express 本地代理；Vercel Serverless Functions（`api/*`）。
- 关键页面与接口：
  - 页面：`/generate/`（仓库：`generate/index.html`）
  - 接口：`POST /api/generate`（Vercel 函数：`api/generate.js`）
- 外部服务：火山引擎 Ark Images Generations（生图）。
- 默认端口（本地）：`8790`。
- 配置文件：`vercel.json`（保证 `/api/generate`、`/api/ping` 正确路由到对应函数）。

## 时间线与关键操作

1. 建链与测试（本地）
   - 通过本地后端 `server/index.js` 提供 `POST /api/generate` 代理 Ark 生图接口；页面 `generate/index.html` 发起请求。
   - 端口占用后切换到 `8790`；确认 `GET /health` 为 `{ ok: true }`，`/generate/` 页面可访问。
   - 结论：页面 → 本地后端 → Ark 外网链路已打通；失败多为“模型不匹配/无权限”。

2. 后端与前端增强
   - 后端（`server/index.js`）
     - 仅使用 `ARK_IMAGE_MODEL_ID` 作为默认生图模型（不再回落到聊天模型）。
     - 透传参考图 `image`（支持数组/单个 URL）与 `sequential_image_generation_options`（如 `max_images`）。
   - 前端（`generate/index.html`）
     - 增加 `sequential_image_generation=auto` 选项。
     - 新增“参考图 URL（每行一个）”与 `max_images` 输入。

3. Vercel 404 故障与修复
   - 现象：线上前端请求 `/api/generate` 返回 404。
   - 根因：部署根目录未包含 `api/`（或缺少路由映射），Serverless Function 未被 Vercel 识别。
   - 修复：
     - 新增 `api/generate.js`（Vercel 函数，转发到 Ark）。
     - 新增 `api/ping.js`（最小探活函数，方便验证路由存在）。
     - 新增 `vercel.json`，显式路由：
       ```json
       {
         "routes": [
           { "src": "/api/generate", "dest": "/api/generate.js" },
           { "src": "/api/ping", "dest": "/api/ping.js" }
         ]
       }
       ```
     - 恢复静态页到 `generate/index.html`（避免误放到其它目录）。

4. Git 推送与提交节点
   - 提交 e0a99c4：后端/前端支持参考图与串行选项，默认生图模型。
   - 提交 4ba4426：曾将页面改名到 `api/`（后续已恢复）。
   - 提交 01db86f：新增 `api/generate.js`，恢复页面到 `generate/index.html`。
   - 提交 dc097dc：新增 `vercel.json` 路由与 `api/ping.js` 校验端点。

## 当前代码结构（相关部分）

- 页面：`generate/index.html`
- 本地代理：`server/index.js`
- Vercel 函数：
  - `api/generate.js`（POST，仅返回 JSON，强制 `stream=false`）
  - `api/ping.js`（GET 200，用于路由探活）
- 路由配置：`vercel.json`

## 环境变量（最小集）

- `ARK_API_KEY` 或 `VOLC_API_KEY`（二选一即可）
- `ARK_IMAGE_MODEL_ID`（必须为支持 Images Generations 的模型/endpoint，例如 `ep-...` 或已开通权限的模型 ID）
- 可选：`ARK_IMAGE_API_BASE`（默认北京地区 Images Generations 接口）

说明：`.env`、`.env.local` 已在 `.gitignore` 忽略，避免密钥入库。Vercel 上请在 Project → Settings → Environment Variables 中配置。

## 本地运行（开发）

```powershell
$env:PORT = '8790'
node server/index.js

# 自检
# GET http://127.0.0.1:8790/health => { ok: true }
# GET http://127.0.0.1:8790/generate/ => 生图页面可访问
```

## Vercel 部署要点

- Root Directory：选择“仓库根目录”（包含 `package.json`、`api/`、`generate/`、`vercel.json` 的那层）。不要选子目录（例如 `generate/`）。
- Framework Preset：Other（无构建）。
- Build Command：留空；Output Directory：留空。
- 环境变量：配置 `ARK_API_KEY`、`ARK_IMAGE_MODEL_ID`。
- 验证：
  - `GET /api/ping` 应返回 200 与 `{ ok: true }`。
  - `GET /api/generate` 应返回 405（仅允许 POST/OPTIONS）。
  - `POST /api/generate` 应返回 Ark 的 JSON（images 或错误详情）。

## 接口字段对齐（Ark Images Generations）

- 请求体支持：`prompt`、`n`、`size`、`model`、`response_format`、`image`（参考图 URL 数组/单个）、`sequential_image_generation`（`disabled`/`enabled`/`auto`）、`sequential_image_generation_options`（如 `{ max_images }`）、`watermark`、`stream`（在 Vercel 函数内会强制 `false` 以便返回 JSON）。
- 返回（规范化）：`{ ok, model, images: string[], raw }`，其中 `images` 兼容 `url` 或 `b64_json`。

## 常见问题与定位

- 线上 404（/api/generate）：
  - 多因 Root Directory 选错（未包含 `api/`），或缺少 `vercel.json` 路由。
  - 验证：`/api/ping` 是否 200；若 404，说明函数未被识别。
- 405（/api/generate GET）：
  - 正常现象：函数仅支持 POST/OPTIONS。
- Ark 返回 `InvalidParameter`：
  - 传入了不支持生图的聊天模型（如 `doubao-seed-*`）；改为具备生图权限的模型/endpoint。
- Ark 返回 `InvalidEndpointOrModel.NotFound`：
  - 未显式指定 `model` 且后端/环境未配置 `ARK_IMAGE_MODEL_ID`，或当前账号无权限。
- 超时或流事件：
  - Vercel 函数中关闭 `stream`，仅走 JSON；若需 SSE，请另设流式端点并做事件透传。

## 仍可优化/后续工作

- 如需实时进度：新增 `/api/generate/stream`（Edge Function/SSE 透传）。
- 增加更完善的错误提示与重试机制。
- 统一 README 并附带截图与常见问题 Q&A。

---

最后更新：由代理根据近期协作整理（仅涵盖“生图 + Vercel 部署”相关改动）。

