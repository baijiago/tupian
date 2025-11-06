# 抠图去背景 模块修 Bug 历史

> 模块路径：emove-bg/；后端：server/

## 2025-11-06 上传对话框无反应（无法弹出文件选择）
- 现象：点击上传区域无响应，用户无法选择图片。
- 根因：此前对页面脚本做逐段注入时产生语法冲突，导致绑定 click/change 等事件的脚本未执行。
- 修复：
  - 重写 emove-bg/index.html 的前端脚本，确保事件在页面加载后稳定绑定。
  - 明确新增可见按钮 #pick，直接 click() 触发隐藏的 <input type="file">，避免仅依赖容器点击。
  - 继续保留拖拽上传（drag&drop）能力。
- 验证：
  - 刷新（Ctrl+F5）后点击“选择文件”按钮可正常唤起系统文件选择框。
  - 选择图片后右侧显示原图预览；继续“去背景”流程可得到结果预览与下载。
- 变更文件：
  - emove-bg/index.html

## 2025-11-06 背景图片 URL 使用本地路径导致失败
- 现象：选择“背景=图片URL”时，填写了 C:\... 本地路径导致请求失败。
- 根因：remove.bg 仅能访问公网 URL，无法读取本地磁盘路径。
- 修复：前端在提交前新增校验，仅允许 http:// 或 https:// 开头的 URL（否则提示并阻止提交）。
- 变更文件：
  - emove-bg/index.html

## 2025-11-06 拖拽文件夹进入上传区导致失败
- 现象：把整个文件夹从 C:\Users\...\Screenshots\ 拖入，浏览器不会提供文件对象，导致无法预览/提交。
- 处理：
  - 增加容错提示：当 drop 事件无可用文件时提示“请拖拽具体图片文件（不支持文件夹）”。
  - 同时提供“选择文件”按钮作为兜底。
- 变更文件：
  - emove-bg/index.html

## 2025-11-06 前端功能补全与体验
- 新增/完善：
  - 参数选择：输出尺寸 uto|preview|small|medium|hd|4k；背景模式 	ransparent|color|image（联动颜色选择器/URL 输入）。
  - 原图预览与结果预览：使用 URL.createObjectURL，在切换文件/结果时 evokeObjectURL 释放资源。
  - 下载文件名：按原始文件名生成 原名-no-bg.(png|webp|jpg)。
  - 输入校验：仅接受 image/*，限制 ≤ 25MB。
- 变更文件：
  - emove-bg/index.html

## 2025-11-05/06 后端代理与运行
- 内容：
  - POST /api/remove-bg：multer.memoryStorage() 接收 image_file，透传 size、g_color、g_image_url 到 https://api.remove.bg/v1.0/removebg，二进制回传、错误封装。
  - 读取 .env：REMOVE_BG_API_KEY，端口 PORT=8787。
  - 静态资源服务根目录；/health 返回 { ok: true }。
- 操作记录：
  - 安装依赖（
pm install）。注意：multer@1.x 有安全告警，后续考虑升级到 2.x。
  - 写入 API Key 至 .env：REMOVE_BG_API_KEY=bJjUhobN9b9EYB3LSZC9bgXp。
  - 启动服务，健康检查通过。
- 变更文件：
  - server/index.js
  - .env
  - package.json（运行脚本）

## 已知与后续
- 已知：multer@1.x 弃用告警；评估升级到 2.x 的改动（字段名与中间件用法基本兼容）。
- 建议：
  1) 增加失败态可视化（在预览卡片内展示错误信息）。
  2) 可选服务端落盘（保存处理结果到 outputs/ 并返回下载链接）。
  3) 批量处理与历史记录（本地 IndexedDB）。
