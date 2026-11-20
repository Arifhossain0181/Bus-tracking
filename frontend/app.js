const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const NEXT_PORT = 3001;
const DJANGO_PORT = 8000;
const NODE20_BIN = '/home/dsriubatac/.nvm/versions/node/v20.20.2/bin/node';
const GUNICORN_BIN = '/home/dsriubatac/Bus-tracking/backend/venv/bin/gunicorn';
const BACKEND_DIR = '/home/dsriubatac/Bus-tracking/backend';
const FRONTEND_DIR = '/home/dsriubatac/Bus-tracking/frontend';
const LOG_FILE = '/home/dsriubatac/gateway.log';

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
  console.log(msg);
}

log('[UBus Master Gateway] Booting process under Passenger...');

let nextProc = null;
let djangoProc = null;

function startDjango() {
  if (djangoProc) return;
  log(`[UBus Master] Starting Django Gunicorn on port ${DJANGO_PORT}...`);
  
  const gunicornPath = fs.existsSync(GUNICORN_BIN) ? GUNICORN_BIN : 'gunicorn';
  djangoProc = spawn(gunicornPath, [
    'core.wsgi:application',
    '--bind', `127.0.0.1:${DJANGO_PORT}`,
    '--workers', '2'
  ], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PATH: '/home/dsriubatac/Bus-tracking/backend/venv/bin:' + (process.env.PATH || '')
    }
  });

  djangoProc.stdout.on('data', (d) => log(`[Django] ${d.toString().trim()}`));
  djangoProc.stderr.on('data', (d) => log(`[Django ERR] ${d.toString().trim()}`));
  djangoProc.on('exit', (code, sig) => {
    log(`[UBus Master] Django exited (code: ${code}, sig: ${sig}), restarting in 3s...`);
    djangoProc = null;
    setTimeout(startDjango, 3000);
  });
}

function startNext() {
  if (nextProc) return;
  log(`[UBus Master] Starting Next.js (Node 20) on port ${NEXT_PORT}...`);

  const nodeBin = fs.existsSync(NODE20_BIN) ? NODE20_BIN : process.execPath;
  const nextCli = path.join(FRONTEND_DIR, 'node_modules/next/dist/bin/next');

  nextProc = spawn(nodeBin, [
    nextCli,
    'start',
    '-p', String(NEXT_PORT),
    '-H', '127.0.0.1'
  ], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      PORT: String(NEXT_PORT),
      NODE_ENV: 'production'
    }
  });

  nextProc.stdout.on('data', (d) => log(`[Next] ${d.toString().trim()}`));
  nextProc.stderr.on('data', (d) => log(`[Next ERR] ${d.toString().trim()}`));
  nextProc.on('exit', (code, sig) => {
    log(`[UBus Master] Next.js exited (code: ${code}, sig: ${sig}), restarting in 3s...`);
    nextProc = null;
    setTimeout(startNext, 3000);
  });
}

// Start backend services
startDjango();
startNext();

// Clean teardown on signals
process.on('SIGTERM', () => {
  log('[UBus Master] SIGTERM received, killing child processes...');
  if (nextProc) nextProc.kill();
  if (djangoProc) djangoProc.kill();
  process.exit(0);
});
process.on('SIGINT', () => {
  log('[UBus Master] SIGINT received, killing child processes...');
  if (nextProc) nextProc.kill();
  if (djangoProc) djangoProc.kill();
  process.exit(0);
});

// HTTP Proxy Server
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const isBackend = url.startsWith('/api/') ||
                    url.startsWith('/admin') ||
                    url.startsWith('/static/admin') ||
                    url.startsWith('/static/rest_framework');

  const targetPort = isBackend ? DJANGO_PORT : NEXT_PORT;

  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'x-forwarded-for': req.socket.remoteAddress || '',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': req.headers.host || 'ubus.dsr.iubat.ac.bd'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('UBus Transit Gateway: সার্ভিস চালু হচ্ছে, অনুগ্রহ করে কয়েক সেকেন্ড পর পেজটি রিফ্রেশ দিন...');
    }
  });

  req.pipe(proxyReq, { end: true });
});

// WebSocket Upgrade Proxy
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  const isBackend = url.startsWith('/api/') || url.startsWith('/admin');
  const targetPort = isBackend ? DJANGO_PORT : NEXT_PORT;

  const proxySocket = net.connect(targetPort, '127.0.0.1', () => {
    socket.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    if (head && head.length > 0) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxySocket.on('error', () => {
    socket.destroy();
  });
});

if (typeof(PhusionPassenger) !== 'undefined') {
  server.listen('passenger');
} else {
  server.listen(process.env.PORT || 3000);
}
