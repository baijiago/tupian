export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const apiKey = process.env.ARK_API_KEY || process.env.VOLC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'server_missing_api_key', detail: 'ARK_API_KEY/VOLC_API_KEY not set' });
      return;
    }

    // read body as JSON
    const bodyText = await new Promise((resolve, reject) => {
      try {
        if (req.body && typeof req.body === 'object') return resolve(JSON.stringify(req.body));
        let data = '';
        req.setEncoding('utf8');
        req.on('data', (c) => (data += c));
        req.on('end', () => resolve(data || '{}'));
        req.on('error', reject);
      } catch (e) { reject(e); }
    });
    let input = {};
    try { input = JSON.parse(bodyText || '{}'); } catch { input = {}; }

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
    } = input;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'invalid_prompt', detail: 'prompt is required' });
      return;
    }

    const envModel = process.env.ARK_IMAGE_MODEL_ID || '';
    const arkModel = model || envModel;
    const apiBase = process.env.ARK_IMAGE_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

    // Build payload
    const payload = {
      prompt: String(prompt),
      n: Math.min(Math.max(Number(n) || 1, 1), 4),
      size: size || process.env.ARK_IMAGE_DEFAULT_SIZE || '2K',
      response_format: response_format || process.env.ARK_IMAGE_RESPONSE_FORMAT || 'url',
    };
    if (arkModel) payload.model = arkModel;

    // reference images
    if (image) {
      if (Array.isArray(image)) {
        const arr = image.filter((u) => typeof u === 'string' && u.trim());
        if (arr.length) payload.image = arr;
      } else if (typeof image === 'string' && image.trim()) {
        payload.image = [image.trim()];
      }
    }

    if (negative_prompt && typeof negative_prompt === 'string') {
      payload.negative_prompt = negative_prompt;
    }
    if (typeof sequential_image_generation !== 'undefined') {
      payload.sequential_image_generation = sequential_image_generation;
    }
    if (sequential_image_generation_options && typeof sequential_image_generation_options === 'object') {
      payload.sequential_image_generation_options = sequential_image_generation_options;
    }

    // Avoid SSE stream in serverless; always request non-streaming JSON
    if (typeof stream !== 'undefined') {
      // ignore client-provided stream to keep JSON response
    }
    payload.stream = false;

    const up = await fetch(apiBase, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await up.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!up.ok) {
      res.status(up.status).json({ error: 'ark_error', detail: data });
      return;
    }

    // Normalize images
    let images = [];
    if (data && Array.isArray(data.data)) {
      images = data.data.map((it) => it?.b64_json ? `data:image/png;base64,${it.b64_json}` : (it?.url || null)).filter(Boolean);
    }
    if (!images.length && data && Array.isArray(data.choices)) {
      try {
        const contents = data.choices[0]?.message?.content || [];
        for (const c of contents) {
          if (c?.type === 'image_url' && c.image_url?.url && String(c.image_url.url).startsWith('data:')) {
            images.push(c.image_url.url);
          }
        }
      } catch {}
    }

    res.status(200).json({ ok: true, model: arkModel, images, raw: data });
  } catch (err) {
    res.status(500).json({ error: 'proxy_error', detail: String(err && err.message || err) });
  }
}
