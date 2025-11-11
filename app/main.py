import os
import imghdr
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from .ark_client import ark_vision_chat, guess_mime

APP_TITLE = "图片识别演示 (Volc Ark)"
DEFAULT_MODEL = os.getenv("ARK_MODEL_ID", "ep-20250921140145-v9tg9")

# Load API key from env or .env.local
API_KEY = os.getenv("ARK_API_KEY") or os.getenv("VOLC_API_KEY")
if not API_KEY:
    env_path = os.path.join(os.getcwd(), ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("ARK_API_KEY="):
                    API_KEY = line.strip().split("=", 1)[1]
                    break
                if not API_KEY and line.startswith("VOLC_API_KEY="):
                    API_KEY = line.strip().split("=", 1)[1]

HTML_TEMPLATE = """
<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"/><title>图片识别演示</title>
<style>body{font-family:system-ui,Segoe UI,Arial;margin:2rem} .box{border:1px dashed #ccc;padding:1rem;border-radius:8px}
pre{white-space:pre-wrap;word-break:break-all;background:#f7f7f7;padding:1rem;border-radius:6px}
</style>
</head>
<body>
<h2>图片识别（火山引擎 Ark Chat Completions）</h2>
<div class="box">
  <input id="files" type="file" accept="image/*" multiple />
  <input id="prompt" type="text" value="识别图片" style="width:300px"/>
  模型ID: <input id="model" type="text" value="{{MODEL_VALUE}}" style="width:340px"/>
  <button onclick="doUpload()">上传并识别</button>
  <p id="tip"></p>
</div>
<div id="out"></div>
<script>
async function doUpload(){
  const inEl = document.getElementById('files');
  const prompt = document.getElementById('prompt').value || '识别图片';
  const model = document.getElementById('model').value || '';
  const files = inEl.files;
  if(!files || files.length===0){
    alert('请选择至少一张图片');
    return;
  }
  const form = new FormData();
  for(const f of files){ form.append('files', f); }
  form.append('prompt', prompt);
  form.append('model', model);
  const tip = document.getElementById('tip');
  tip.textContent = '请求中...';
  const r = await fetch('/api/recognize', { method: 'POST', body: form });
  const json = await r.json();
  tip.textContent = '';
  const out = document.getElementById('out');
  out.innerHTML = '';
  for (const item of json.results){
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(item, null, 2);
    out.appendChild(pre);
  }
}
</script>
</body>
</html>
"""

app = FastAPI(title=APP_TITLE)


class RecognizeResult(BaseModel):
    filename: str
    status: int
    response: dict


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTML_TEMPLATE.replace("{{MODEL_VALUE}}", DEFAULT_MODEL)


def _validate_image_bytes(content: bytes) -> bool:
    kind = imghdr.what(None, h=content)
    return kind in {"jpeg", "png", "gif", "tiff", "bmp"} or kind is None


@app.post("/api/recognize")
async def recognize(
    files: List[UploadFile] = File(...),
    prompt: str = "识别图片",
    model: Optional[str] = None,
):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="未配置 ARK_API_KEY/VOLC_API_KEY，请在 .env.local 中设置")
    results = []
    sel_model = model or DEFAULT_MODEL
    for uf in files:
        content = await uf.read()
        if not _validate_image_bytes(content):
            raise HTTPException(status_code=415, detail=f"文件 {uf.filename} 不是有效图片")
        mime = uf.content_type or guess_mime(uf.filename)
        status, resp = ark_vision_chat(API_KEY, sel_model, prompt, content, mime)
        results.append({"filename": uf.filename, "status": status, "response": resp})
    return JSONResponse({"model": sel_model, "results": results})
