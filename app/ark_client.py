import base64
import json
import mimetypes
import urllib.request
import urllib.error
from typing import Tuple

ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"


def guess_mime(filename: str, fallback: str = "image/jpeg") -> str:
    mime, _ = mimetypes.guess_type(filename)
    if not mime:
        return fallback
    return mime


def to_data_url(image_bytes: bytes, mime: str) -> str:
    # Build data URL required by Ark: data:image/{fmt};base64,{b64}
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def ark_vision_chat(api_key: str, model: str, prompt: str, image_bytes: bytes, mime: str) -> Tuple[int, dict]:
    data_url = to_data_url(image_bytes, mime)
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        ARK_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            status = resp.getcode()
            text = resp.read().decode("utf-8", errors="replace")
            try:
                return status, json.loads(text)
            except json.JSONDecodeError:
                return status, {"raw": text}
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(err_text)
        except json.JSONDecodeError:
            return e.code, {"error": err_text}
    except Exception as e:  # network or timeout
        return 0, {"error": str(e)}
