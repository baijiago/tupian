#!/usr/bin/env python3
# Stdlib-only CLI to call Volc Ark vision chat with one image.
import os, sys, base64, json, mimetypes, urllib.request, urllib.error

ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"

def to_data_url(image_path: str) -> str:
    with open(image_path, 'rb') as f:
        b = f.read()
    mime, _ = mimetypes.guess_type(image_path)
    if not mime: mime = 'image/jpeg'
    return f"data:{mime};base64," + base64.b64encode(b).decode('ascii')


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/ark_cli.py <image_path> [prompt]", file=sys.stderr)
        sys.exit(2)
    img = sys.argv[1]
    prompt = sys.argv[2] if len(sys.argv) >= 3 else "????"

    api_key = os.getenv('ARK_API_KEY') or os.getenv('VOLC_API_KEY')
    if not api_key:
        # best-effort read from .env.local
        try:
            with open('.env.local','r',encoding='utf-8') as f:
                for line in f:
                    if line.startswith('ARK_API_KEY='): api_key = line.split('=',1)[1].strip(); break
                    if not api_key and line.startswith('VOLC_API_KEY='): api_key = line.split('=',1)[1].strip()
        except FileNotFoundError:
            pass
    if not api_key:
        print("Missing ARK_API_KEY/VOLC_API_KEY in env or .env.local", file=sys.stderr)
        sys.exit(1)

    model = os.getenv('ARK_MODEL_ID', 'ep-20250921140145-v9tg9')
    data_url = to_data_url(img)
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]}
        ]
    }
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(ARK_URL, data=body, headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            txt = resp.read().decode('utf-8', 'replace')
            try:
                print(json.dumps(json.loads(txt), ensure_ascii=False, indent=2))
            except json.JSONDecodeError:
                print(txt)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}")
        print(e.read().decode('utf-8','replace'))
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
