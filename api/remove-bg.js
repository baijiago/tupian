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
    const apiKey = process.env.REMOVE_BG_API_KEY || process.env.REMOVE_BG_KEY || process.env.RemoveBgKey;
    if (!apiKey) {
      res.status(500).json({ error: 'server_missing_api_key', detail: 'REMOVE_BG_API_KEY not set' });
      return;
    }

    // Read raw multipart body and forward to remove.bg; avoids parsing on serverless
    const body = await new Promise((resolve, reject) => {
      try {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      } catch (e) { reject(e); }
    });

    const ct = req.headers['content-type'] || 'application/octet-stream';

    const up = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Accept': '*/*',
        'Content-Type': ct,
      },
      body,
    });

    const buf = Buffer.from(await up.arrayBuffer());

    if (!up.ok) {
      // remove.bg returns text/json on errors; try to stringify
      let detail;
      try { detail = buf.toString('utf8'); } catch { detail = String(buf); }
      res.status(up.status).json({ error: 'remove.bg error', detail });
      return;
    }

    // Pass-through content-type; default to image/png
    res.setHeader('Content-Type', up.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (err) {
    res.status(500).json({ error: 'proxy_error', detail: String(err && err.message || err) });
  }
}
