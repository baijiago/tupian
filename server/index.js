import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// Serve static site from repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
app.use(express.static(rootDir));

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/remove-bg", upload.single("image_file"), async (req, res) => {
  try {
    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server missing REMOVE_BG_API_KEY" });
    if (!req.file) return res.status(400).json({ error: "image_file is required" });

    const form = new FormData();
    form.append("image_file", req.file.buffer, { filename: req.file.originalname || "upload.jpg" });
    form.append("size", req.body.size || "auto");
    if (req.body.bg_color) form.append("bg_color", req.body.bg_color);
    if (req.body.bg_image_url) form.append("bg_image_url", req.body.bg_image_url);

    const resp = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
      headers: { ...form.getHeaders(), "X-Api-Key": apiKey },
      responseType: "arraybuffer",
      validateStatus: () => true,
    });

    if (resp.status !== 200) {
      const text = Buffer.from(resp.data).toString("utf8");
      return res.status(resp.status).json({ error: "remove.bg error", detail: text });
    }

    res.setHeader("Content-Type", resp.headers["content-type"] || "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(resp.data));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "proxy_error", detail: String(err?.message || err) });
  }
});

// AI 生图：火山 Ark 代理
// 期望请求体(JSON)：{ prompt: string, n?: number(1-4), size?: string('512x512'等), model?: string, negative_prompt?: string }
// 环境变量：
// - ARK_API_KEY / VOLC_API_KEY 之一
// - ARK_IMAGE_MODEL_ID（可选，前端可覆盖）
// - ARK_IMAGE_API_BASE（可选，默认 https://ark.cn-beijing.volces.com/api/v3/images/generations）
app.post("/api/generate", async (req, res) => {
  try {
    const getArkKey = () => {
      let k = process.env.ARK_API_KEY || process.env.VOLC_API_KEY;
      if (k) return k;
      // 尝试从 .env.local 读取（与 Python 侧保持一致习惯）
      try {
        const p = path.resolve(process.cwd(), ".env.local");
        if (fs.existsSync(p)) {
          const text = fs.readFileSync(p, "utf8");
          for (const line of text.split(/\r?\n/)) {
            if (line.startsWith("ARK_API_KEY=")) return line.split("=", 2)[1].trim();
            if (line.startsWith("VOLC_API_KEY=") && !k) k = line.split("=", 2)[1].trim();
          }
          if (k) return k;
        }
      } catch (_) {}
      return undefined;
    };

    const apiKey = getArkKey();
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "server_missing_api_key", detail: "ARK_API_KEY/VOLC_API_KEY 未配置" });
    }

    const {
      prompt,
      n,
      size,
      model,
      negative_prompt,
      response_format,
      sequential_image_generation,
      sequential_image_generation_options,
      image,
      stream,
      watermark,
    } = req.body || {};
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "invalid_prompt", detail: "prompt 不能为空" });
    }

    const envModel = process.env.ARK_IMAGE_MODEL_ID || "";
    const arkModel = model || envModel; // 仅当存在时才下传
    const apiBase = process.env.ARK_IMAGE_API_BASE ||
      "https://ark.cn-beijing.volces.com/api/v3/images/generations";

    // 与 OpenAI Images 兼容的负载（Ark 兼容）；按需透传参数
    const payload = {
      prompt: String(prompt),
      n: Math.min(Math.max(Number(n) || 1, 1), 4),
      size: size || process.env.ARK_IMAGE_DEFAULT_SIZE || "2K",
      response_format: response_format || process.env.ARK_IMAGE_RESPONSE_FORMAT || "url",
    };
    if (arkModel) payload.model = arkModel; // 生图若只有一个默认模型，可省略
    if (negative_prompt && typeof negative_prompt === "string") {
      payload.negative_prompt = negative_prompt;
    }
    // optional reference images (URLs)
    if (image) {
      if (Array.isArray(image)) {
        const arr = image.filter((u) => typeof u === "string" && u.trim());
        if (arr.length) payload.image = arr;
      } else if (typeof image === "string" && image.trim()) {
        payload.image = [image.trim()];
      }
    }
    if (typeof sequential_image_generation !== "undefined") {
      payload.sequential_image_generation = sequential_image_generation;
    }
    if (
      sequential_image_generation_options &&
      typeof sequential_image_generation_options === "object"
    ) {
      payload.sequential_image_generation_options = sequential_image_generation_options;
    }
    // Normalize booleans possibly passed as strings
    const toBool = (v) => (typeof v === "boolean" ? v : (typeof v === "string" ? v.toLowerCase() === "true" : undefined));
    const streamBool = toBool(stream);
    const watermarkBool = toBool(watermark);
    if (typeof streamBool === "boolean") payload.stream = streamBool;
    if (typeof watermarkBool === "boolean") payload.watermark = watermarkBool;

    const upstream = await axios.post(apiBase, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
      validateStatus: () => true,
    });

    if (upstream.status !== 200) {
      let detail;
      try { detail = typeof upstream.data === "string" ? upstream.data : JSON.stringify(upstream.data); }
      catch { detail = String(upstream.data); }
      return res.status(upstream.status).json({ error: "ark_error", detail });
    }

    const data = upstream.data || {};
    // 优先处理 images/generations 风格 { data: [ { b64_json | url } ] }
    let images = [];
    if (Array.isArray(data?.data)) {
      images = data.data.map((it) => {
        if (it?.b64_json) return `data:image/png;base64,${it.b64_json}`;
        if (it?.url) return String(it.url);
        return null;
      }).filter(Boolean);
    }
    // 兼容 chat/completions 里可能返回的 data:image/*;base64 URL
    if (!images.length && Array.isArray(data?.choices)) {
      try {
        const contents = data.choices[0]?.message?.content || [];
        for (const c of contents) {
          if (c?.type === "image_url" && c.image_url?.url && String(c.image_url.url).startsWith("data:")) {
            images.push(c.image_url.url);
          }
        }
      } catch (_) {}
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, model: arkModel, images, raw: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "proxy_error", detail: String(err?.message || err) });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
