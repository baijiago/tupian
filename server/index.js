import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
