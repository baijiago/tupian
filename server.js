// Simple static file server for local dev (auto-picks free port if busy)
const http = require('http');
const fs = require('fs');
const path = require('path');\nconst https = require('https');

const host = process.env.HOST || '127.0.0.1';
const preferredPort = Number(process.env.PORT) || 5173;
const root = process.cwd();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}){
  res.writeHead(status, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...headers,
  });
  if (body && (body.pipe)) return body.pipe(res);
  res.end(body);
}

\n\nfunction proxyRemoveBg(req, res){
  const https = require("https");
  if (req.method !== 'POST') return send(res, 405, 'Method Not Allowed');
  const key = process.env.REMOVE_BG_KEY || process.env.RemoveBgKey || process.env.REMOVE_BG_API_KEY;
  if (!key) return send(res, 500, JSON.stringify({ ok:false, error:'REMOVE_BG_KEY not set' }), { 'Content-Type':'application/json; charset=utf-8' });

  const headers = {};
  const h = req.headers || {};
  if (h['content-type']) headers['Content-Type'] = h['content-type'];
  if (h['content-length']) headers['Content-Length'] = h['content-length'];
  headers['X-API-Key'] = key;
  headers['Accept'] = '*/*';

  const upstream = https.request({
    hostname: 'api.remove.bg',
    path: '/v1.0/removebg',
    method: 'POST',
    headers,
  }, (up) => {
    const respHeaders = Object.assign({}, up.headers, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });
    res.writeHead(up.statusCode || 500, respHeaders);
    up.pipe(res);
  });

  upstream.on('error', (e) => {
    send(res, 502, JSON.stringify({ ok:false, error: 'Upstream error', detail: String(e && e.message || e) }), { 'Content-Type':'application/json; charset=utf-8' });
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURI((req.url || '/').split('?')[0]);

    // API: proxy to remove.bg
    if (urlPath === '/api/remove-bg') {
      return proxyRemoveBg(req, res);
    }

    // Static
    let filePath = resolvePath(urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    if (!fs.existsSync(filePath)) return send(res, 404, 'Not Found');
    const stream = fs.createReadStream(filePath);
    send(res, 200, stream, { 'Content-Type': mime });
  } catch (e) {
    send(res, 500, 'Internal Server Error');
  }
});

function logReady(){
  const addr = server.address();
  const actualPort = addr && typeof addr === 'object' ? addr.port : preferredPort;
  console.log(`Dev server: http://${host}:${actualPort}`);
  console.log('Open / (首页) 或 /compress/');
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.warn(`Port ${preferredPort} in use, picking a free port...`);
    server.listen(0, host, logReady); // 0 = random free port
  } else {
    console.error(err); process.exit(1);
  }
});

server.listen(preferredPort, host, logReady);