import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, copyFileSync, renameSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
const APP_VERSION = '1.2.0';
const REPO = 'justsadnyx-ux/convert2gif-source';
const HOSTED_BY = 'https://convert2gif.pages.dev/';
const GITHUB_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const EXE_ASSET = 'Convert2GIF-Bootstrap.exe';
const APP_ASSET_PREFIX = 'convert2gif-app';

const USERDATA = process.env.CONVERT2GIF_USERDATA || path.join(os.homedir(), 'AppData', 'Roaming', 'Convert2GIF');
const CONFIG_PATH = path.join(USERDATA, 'config.json');
const CONTROL_PATH = path.join(USERDATA, 'control.json');
const STATE_PATH = path.join(USERDATA, 'state.json');
const LOG_DIR = path.join(USERDATA, 'logs');
const BOT_LOG = path.join(LOG_DIR, 'bot.log');
const APPS_ROOT = path.join(USERDATA, 'app');
const UPDATES_DIR = path.join(USERDATA, 'updates');
const TOKEN_PATH = path.join(USERDATA, 'token.txt');

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
let botProc = null;
let botState = 'stopped';
let botLogBuf = [];
let healCount = 0;
let serverRef = null;
let lastFlashMsg = null;
const broadcasters = new Set();

function ensureDirs() {
  for (const d of [USERDATA, LOG_DIR, APPS_ROOT, UPDATES_DIR]) mkdirSync(d, { recursive: true });
}

function readJson(p, fb) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; }
}
function writeJson(p, obj) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function loadState() { return readJson(STATE_PATH, {}); }
function saveState(s) { writeJson(STATE_PATH, s); }
function getConfig() { return readJson(CONFIG_PATH, {}); }
function saveConfig(c) { writeJson(CONFIG_PATH, c); }
function getControl() { return readJson(CONTROL_PATH, { presence: 'online' }); }
function saveControl(c) { writeJson(CONTROL_PATH, Object.assign(getControl(), c)); }

function getToken() {
  try { return readFileSync(TOKEN_PATH, 'utf8').trim(); } catch {
    const t = Array.from({ length: 24 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    writeFileSync(TOKEN_PATH, t, 'utf8');
    return t;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function run(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 120000, windowsHide: true, ...opts });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
  } catch (e) {
    return { status: -1, stdout: '', stderr: String(e), error: e };
  }
}

function logLine(txt) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${txt}`;
  botLogBuf.push(line);
  if (botLogBuf.length > 2000) botLogBuf = botLogBuf.slice(-2000);
  appendFileSync(BOT_LOG, line + '\n', 'utf8');
  broadcast({ t: 'log', line });
}

function broadcast(obj) {
  const m = JSON.stringify(obj);
  for (const ws of broadcasters) { try { ws.send(m); } catch { /* noop */ } }
}

function findNodeExe() {
  const tryVersioned = (p) => {
    if (!p || !existsSync(p)) return null;
    if (nodeVersion(p) >= 22) return p;
    return null;
  };
  if (process.env.CONVERT2GIF_NODE) {
    const p = tryVersioned(process.env.CONVERT2GIF_NODE);
    if (p) return p;
  }
  const r = run('where', ['node']);
  if (r.status === 0) {
    for (const raw of String(r.stdout).split(/\r?\n/)) {
      const cand = raw.trim();
      if (!cand || /WindowsApps/i.test(cand)) continue;
      const p = tryVersioned(cand);
      if (p) return p;
    }
  }
  const common = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
    path.join(process.env.APPDATA || '', '..', '..', 'Local', 'Programs', 'nodejs', 'node.exe'),
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ];
  for (const c of common) { const p = tryVersioned(c); if (p) return p; }
  return null;
}

function nodeVersion(exe) {
  const r = run(exe, ['-v']);
  if (r.status !== 0) return 0;
  const m = String(r.stdout).trim().match(/^v?(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function ensureNode(pr) {
  const exe = findNodeExe();
  if (exe) return { ok: true, exe, verbose: false };
  if (!pr) return { ok: false, exe: null, verbose: false };
  logLine('Node.js not found or too old — hittin up the installer...');
  const r = run('winget', ['install', '--id', 'OpenJS.NodeJS.LTS', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { timeout: 600000 });
  if (r.status === 0 || r.status === 1) {
    const exe2 = findNodeExe();
    if (exe2) return { ok: true, exe: exe2, verbose: true };
  }
  return { ok: false, exe: null, verbose: false };
}

function parseVersion(tag) {
  const m = String(tag).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}
function isNewer(a, b) {
  const A = parseVersion(a); const B = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] > B[i]) return true;
    if (A[i] < B[i]) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// github / download
// ---------------------------------------------------------------------------
async function latestRelease() {
  const res = await fetch(GITHUB_LATEST, { headers: { 'User-Agent': 'Convert2GIF-Bootstrap' } });
  if (!res.ok) return null;
  const j = await res.json();
  const assets = (j.assets || []).map(a => ({ name: a.name, url: a.browser_download_url }));
  return {
    tag: j.tag_name,
    appZip: assets.find(a => a.name.startsWith(APP_ASSET_PREFIX)) || null,
    exe: assets.find(a => a.name === EXE_ASSET) || null,
  };
}

async function download(url, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return dest;
}

function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const r = run('tar', ['-xf', zipPath, '-C', destDir]);
  if (r.status === 0) return true;
  const r2 = run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], { timeout: 180000 });
  return r2.status === 0;
}

function npmInstall(appDir) {
  const args = process.platform === 'win32' ? ['/c', 'npm', 'install', '--no-audit', '--no-fund'] : ['npm', 'install', '--no-audit', '--no-fund'];
  const r = run('cmd', args, { cwd: appDir, timeout: 600000 });
  return r.status === 0;
}

function moduleOk(appDir) {
  for (const mod of ['gifenc', 'jpeg-js', 'omggif', 'upng-js']) {
    if (!existsSync(path.join(appDir, 'node_modules', mod))) return false;
  }
  return true;
}

function appHealth(appDir) {
  const checks = {
    'bot.js': existsSync(path.join(appDir, 'bot.js')),
    deps: moduleOk(appDir),
  };
  return checks;
}

async function provisionApp(version, force) {
  if (!force) {
    const appDir = path.join(APPS_ROOT, 'v' + version);
    if (existsSync(path.join(appDir, 'bot.js')) && moduleOk(appDir)) {
      saveState({ ...loadState(), installed: version, appDir });
      return { ok: true, appDir, skipped: true };
    }
  }
  broadcast({ t: 'scene', name: 'download' });
  logLine(`Pulling down Convert2GIF app v${version}...`);
  const rel = await latestRelease();
  if (!rel || !rel.appZip) throw new Error('no app asset found');
  const zip = path.join(UPDATES_DIR, rel.appZip.name);
  await download(rel.appZip.url, zip);
  const appDir = path.join(APPS_ROOT, 'v' + version);
  rmSync(appDir, { recursive: true, force: true });
  logLine('Unpackin da goodz...');
  if (!extractZip(zip, appDir)) throw new Error('extract failed');
  logLine('Installing dependencies...');
  if (!npmInstall(appDir)) throw new Error('npm install failed');
  if (!moduleOk(appDir)) {
    if (!npmInstall(appDir)) throw new Error('npm install failed (2)');
  }
  saveState({ ...loadState(), installed: version, appDir });
  broadcast({ t: 'scene', name: 'download', done: true });
  logLine(`App ready: v${version}. Config stays safe in %APPDATA%.`);
  return { ok: true, appDir, skipped: false };
}

function healNeeded(appDir) {
  const h = appHealth(appDir);
  return !h['bot.js'] || !h.deps;
}

// ---------------------------------------------------------------------------
// bot process
// ---------------------------------------------------------------------------
function writeControlPatch(patch) {
  const cur = getControl();
  saveControl({ ...cur, ...patch, at: Date.now() });
}

function startBot() {
  if (botProc) return { ok: true, reason: 'already-running' };
  const cfg = getConfig();
  if (!cfg.token) return { ok: false, reason: 'no-config' };

  const st = loadState();
  const appDir = st.appDir && existsSync(path.join(st.appDir, 'bot.js')) ? st.appDir : null;
  if (!appDir) return { ok: false, reason: 'no-app' };

  if (healNeeded(appDir)) {
    showFlash('🔧 app files loookin sus — auto-repairin...');
    healApp();
    return { ok: false, reason: 'healing' };
  }

  const exe = findNodeExe();
  if (!exe) return { ok: false, reason: 'no-node' };

  writeControlPatch({ stop: false, presence: getControl().presence || 'online' });
  logLine('Firin up the bot...');
  broadcast({ t: 'scene', name: 'start' });

  botProc = spawn(exe, [path.join(appDir, 'bot.js')], {
    cwd: appDir,
    windowsHide: true,
    env: { ...process.env, CONVERT2GIF_USERDATA: USERDATA },
  });
  botState = 'starting';

  const startedAt = Date.now();
  botProc.stdout.on('data', (d) => onBotData(d));
  botProc.stderr.on('data', (d) => onBotData(d));
  botProc.on('exit', (code) => {
    botProc = null;
    botState = 'stopped';
    broadcast({ t: 'state' });
    onBotExit(code, startedAt);
  });
  broadcast({ t: 'state' });
  return { ok: true };
}

function onBotData(d) {
  const text = d.toString();
  const fresh = [];
  for (const l of text.split(/\r?\n/)) if (l.trim()) fresh.push(l);
  logLine(fresh.join('\n'));
}

function onBotExit(code, startedAt) {
  const logTail = botLogBuf.slice(-200).join('\n');
  const quickExit = Date.now() - startedAt < 12000;
  const moduleFail = /ERR_MODULE_NOT_FOUND|Cannot find package|MODULE_NOT_FOUND|Error: Cannot find/i.test(logTail);
  const fatal = /HTTP 401|robot|Invalid token/i.test(logTail) && botLogBuf.slice(-1)[0];
  if (fatal) {
    showFlash('🚫 dat token is dead — fix it in config, breh');
    return;
  }
  if (quickExit || moduleFail) {
    healCount++;
    if (healCount <= 2) {
      showFlash(`💥 bot crashed on startup — auto-healin (${healCount}/2) bra...`);
      healApp();
    } else {
      healCount = 0;
      showFlash('🙅 bot keeps floppin — hit "Repair app" or check yo network');
    }
  }
}

function stopBot() {
  if (!botProc) return { ok: true, already: true };
  botState = 'stopping';
  broadcast({ t: 'state' });
  logLine('Shuttin it down...');
  writeControlPatch({ stop: true });
  const pid = botProc.pid;
  const deadline = Date.now() + 9000;
  const poll = setInterval(() => {
    if (!botProc) {
      clearInterval(poll);
      writeControlPatch({ stop: false });
      botState = 'stopped';
      broadcast({ t: 'state' });
      return;
    }
    if (Date.now() > deadline) {
      clearInterval(poll);
      run('taskkill', ['/PID', String(pid), '/F']);
      writeControlPatch({ stop: false });
      botState = 'stopped';
      botProc = null;
      broadcast({ t: 'state' });
    }
  }, 800);
  return { ok: true };
}

function setPresence(key) {
  writeControlPatch({ presence: key });
  logLine(`Presence switched to: ${key}`);
  broadcast({ t: 'state' });
}

function validateToken(token) {
  const r = spawnSync(findNodeExe() || 'node', ['-e', `fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bot ${token}'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))`], { timeout: 20000, windowsHide: true });
  return r.status === 0;
}

function saveNewConfig(token, clientId) {
  saveConfig({ token, clientId });
  logLine('Config saved — it stays put across updates now.');
}

// ---------------------------------------------------------------------------
// self-heal + repair
// ---------------------------------------------------------------------------
function healApp() {
  const st = loadState();
  if (!st.appDir) return;
  logLine('🩹 self-heal: reinstallin deps...');
  run('cmd', ['/c', 'npm', 'install', '--no-audit', '--no-fund', '--force'], { cwd: st.appDir, timeout: 600000 });
  if (!moduleOk(st.appDir)) {
    logLine('🩹 deps still broken — re-pullin clean app...');
    provisionApp(st.installed || APP_VERSION, true).then(() => {
      broadcast({ t: 'state' });
    }).catch((e) => logLine('repair failed: ' + e.message));
  }
  broadcast({ t: 'state' });
}

function reinstallApp() {
  const st = loadState();
  const ver = st.installed || APP_VERSION;
  return provisionApp(ver, true);
}

// ---------------------------------------------------------------------------
// updates
// ---------------------------------------------------------------------------
async function checkUpdates() {
  const rel = await latestRelease();
  if (!rel) return { available: false, reason: 'net' };
  const newer = isNewer(rel.tag, APP_VERSION);
  if (newer) {
    return { available: true, tag: rel.tag, hasApp: !!rel.appZip, hasExe: !!rel.exe };
  }
  return { available: false, latest: rel.tag };
}

async function applyUpdate() {
  const rel = await latestRelease();
  if (!rel) throw new Error('no release found');
  const newer = isNewer(rel.tag, APP_VERSION);
  if (!newer) throw new Error('already latest');
  broadcast({ t: 'scene', name: 'download' });
  logLine(`UPDATING to ${rel.tag}...`);

  if (botProc) stopBot();

  // 1) app package -> versioned dir, config untouched (lives in %APPDATA%)
  if (rel.appZip) {
    try {
      await provisionApp(rel.tag, true);
    } catch (e) { logLine('app update failed: ' + e.message); }
  }

  // 2) new exe -> swap self
  if (rel.exe) {
    logLine('Grabin new bootstrapper...');
    const newExe = path.join(UPDATES_DIR, EXE_ASSET);
    await download(rel.exe.url, newExe);
    const self = process.execPath;
    broadcast({ t: 'scene', name: 'download', done: true });
    logLine('Swappin myself out — hol on...');
    // hidden: rename old, copy new, relaunch, replace me
    const script = [
      `Start-Sleep -Milliseconds 900`,
      `$self='${self.replace(/'/g, "''")}'`,
      `$new='${newExe.replace(/'/g, "''")}'`,
      `try { Rename-Item -LiteralPath $self -NewName ('Convert2GIF-Bootstrap.old.exe') -Force -ErrorAction Stop } catch {}`,
      `Copy-Item -LiteralPath $new -Destination $self -Force`,
      `Start-Process -FilePath $self`,
      `Start-Sleep -Milliseconds 300`,
      `try { Remove-Item -LiteralPath ($self + '.old') -Force -ErrorAction SilentlyContinue } catch {}`,
      `try { Remove-Item -LiteralPath $self.Replace('.exe','.old.exe') -Force -ErrorAction SilentlyContinue } catch {}`,
      `Stop-Process -Id ${process.pid} -Force -ErrorAction SilentlyContinue`,
    ].join('; ');
    spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { detached: true, stdio: 'ignore' });
    setTimeout(() => { try { process.exit(0); } catch { /* noop */ } }, 2500);
    return { ok: true, swapping: true };
  }

  broadcast({ t: 'scene', name: 'download', done: true });
  broadcast({ t: 'state' });
  return { ok: true };
}

function showFlash(msg) {
  lastFlashMsg = msg;
  broadcast({ t: 'flash', msg });
}

// ---------------------------------------------------------------------------
// http/ui server
// ---------------------------------------------------------------------------
import { UI_HTML } from './ui.js';

function getIps() {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const k of Object.keys(ifaces)) {
      for (const a of ifaces[k] || []) {
        if (a.family === 'IPv4' && !a.internal) out.push(a.address);
      }
    }
  } catch { /* noop */ }
  return out;
}

function getState() {
  const cfg = getConfig();
  const st = loadState();
  const ctrl = getControl();
  return {
    appVersion: APP_VERSION,
    installed: st.installed || null,
    nodeVersion: nodeVersion(findNodeExe() || 'node.exe') || null,
    running: botState,
    configured: !!cfg.token,
    presence: ctrl.presence || 'online',
    token: getToken(),
    ips: getIps(),
    port: serverRef ? (serverRef.port || serverRef.ports[0]) : null,
    flash: lastFlashMsg,
    healCount,
  };
}

async function handleAction(req) {
  const body = await req.json().catch(() => ({}));
  const op = body.op;
  switch (op) {
    case 'start': {
      const r = startBot();
      if (!r.ok && r.reason === 'no-config') return { ok: false, why: 'meed config first' };
      if (!r.ok && r.reason === 'no-app') return { ok: false, why: 'app not installed' };
      return { ok: true };
    }
    case 'stop': {
      stopBot();
      return { ok: true };
    }
    case 'presence': {
      setPresence(['online', 'idle', 'dnd', 'invisible'].includes(body.presence) ? body.presence : 'online');
      return { ok: true };
    }
    case 'saveConfig': {
      const t = String(body.token || '').trim();
      const id = String(body.clientId || '').trim();
      if (!t) return { ok: false, why: 'token required' };
      saveNewConfig(t, id);
      return { ok: true };
    }
    case 'checkUpdates': {
      const u = await checkUpdates();
      showFlash(u.available ? `🚀 update available: ${u.tag}` : `✅ you on the newest (v${APP_VERSION}) real quick`);
      broadcast({ t: 'state' });
      return { ok: true, available: u.available, tag: u.tag };
    }
    case 'applyUpdate': {
      return await applyUpdate();
    }
    case 'repair': {
      const rr = await reinstallApp();
      showFlash(rr && rr.ok ? '✅ app repaired clean' : '❌ repair failed, check the log');
      return { ok: !!(rr && rr.ok) };
    }
    case 'installNode': {
      const r = ensureNode(true);
      if (r.ok) showFlash('✅ node installed, we good');
      else showFlash('❌ could not install node');
      broadcast({ t: 'state' });
      return { ok: true };
    }
    case 'openData': {
      run('explorer', [USERDATA]);
      return { ok: true };
    }
    case 'quit': {
      setTimeout(() => process.exit(0), 400);
      return { ok: true };
    }
    default:
      return { ok: false, why: 'unknown op' };
  }
}

function startServer() {
  const token = getToken();
  const portCandidates = [45579, 45580, 45581, 45582, 45583, 45589];
  let lastErr = null;

  for (const port of portCandidates) {
    try {
      serverRef = Bun.serve({
        port,
        hostname: '0.0.0.0',
        fetch(req, server) {
          const url = new URL(req.url);
          const auth = req.headers.get('x-c2g-token') || url.searchParams.get('tok');
          const okAuth = auth === token;

          if (url.pathname === '/ws') {
            if (!okAuth) return new Response('forbidden', { status: 403 });
            if (server.upgrade(req, { data: {} })) return undefined;
            return new Response('upgrade failed', { status: 400 });
          }
          if (url.pathname === '/' || url.pathname === '/index.html') {
            const html = UI_HTML.replace('__C2G_TOKEN__', token);
            return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          }
          if (url.pathname === '/manifest.json') {
            return new Response(JSON.stringify({
              name: 'Convert2GIF Bootstrapper',
              short_name: 'Convert2GIF',
              start_url: '/#__C2G_TOKEN__',
              display: 'standalone',
              background_color: '#0b0f14',
              theme_color: '#14b8a6',
              icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: '/icon.png', sizes: '192x192', type: 'image/png' }],
            }), { headers: { 'Content-Type': 'application/manifest+json' } });
          }
          if (url.pathname === '/icon.svg') {
            return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="120" fill="#0b0f14"/><rect x="96" y="150" width="320" height="212" rx="24" fill="#14b8a6"/><path d="M180 216l120 40-120 40z" fill="#eafff7"/></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
          }
          if (url.pathname === '/icon.png') {
            return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'), { headers: { 'Content-Type': 'image/png' } });
          }
          if (url.pathname === '/sw.js') {
            const sw = `const C='c2g-v1.2.0';self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(caches.open(C).then(c=>c.match(e.request).then(m=>m||fetch(e.request).then(r=>{c.put(e.request,r.clone());return r;}))));});`;
            return new Response(sw, { headers: { 'Content-Type': 'application/javascript' } });
          }
          if (url.pathname === '/api/state') {
            if (!okAuth) return new Response('forbidden', { status: 403 });
            return new Response(JSON.stringify(getState()), { headers: { 'Content-Type': 'application/json' } });
          }
          if (url.pathname === '/api/log') {
            if (!okAuth) return new Response('forbidden', { status: 403 });
            return new Response(JSON.stringify({ lines: botLogBuf }), { headers: { 'Content-Type': 'application/json' } });
          }
          if (url.pathname === '/api/action' && (req.method === 'POST' || req.method === 'OPTIONS')) {
            if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
            if (!okAuth) return new Response('forbidden', { status: 403 });
            return handleAction(req).then((r) => {
              broadcast({ t: 'state' });
              return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json', ...cors() } });
            }).catch((e) => new Response(JSON.stringify({ ok: false, why: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
          }
          return new Response('not found', { status: 404 });
        },
        websocket: {
          open(ws) {
            broadcasters.add(ws);
            ws.send(JSON.stringify({ t: 'state' }));
            ws.send(JSON.stringify({ t: 'log', lines: botLogBuf.slice(-100) }));
            if (lastFlashMsg) ws.send(JSON.stringify({ t: 'flash', msg: lastFlashMsg }));
          },
          message(ws, msg) {},
          close(ws) { broadcasters.delete(ws); },
        },
      });
      return serverRef;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  logLine('Could not bind any port: ' + (lastErr && lastErr.message));
  return null;
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-c2g-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function openBrowser(port, token) {
  const url = `http://127.0.0.1:${port}/#${token}`;
  try {
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true });
  } catch { /* noop */ }
}

function firstRun() {
  const st = loadState();
  const cfg = getConfig();
  if (!st.appDir || !existsSync(path.join(st.appDir, 'bot.js'))) {
    // provision silently
    provisionApp(APP_VERSION).then(() => {
      saveState({ ...loadState(), installed: APP_VERSION });
      broadcast({ t: 'state' });
      return true;
    }).catch((e) => logLine('first-run provision failed: ' + e.message));
  }
  return !!cfg.token;
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
function boot() {
  ensureDirs();
  ensureNode(false);
  logLine('Convert2GIF Bootstrapper v' + APP_VERSION + ' — ' + HOSTED_BY);
  logLine('Data lives at: ' + USERDATA + ' (config survives updates)');

  firstRun();

  const srv = startServer();
  if (!srv) {
    process.exit(1);
  }
  const port = srv.port;
  const token = getToken();
  const st = getState();
  logLine('Control panel: http://127.0.0.1:' + port + '/ (token: ' + token + ')');
  if (st.ips.length) logLine('📱 Mobile (BETA) on LAN: http://' + st.ips[0] + ':' + port + '/#' + token);

  setTimeout(() => openBrowser(port, token), 500);
}

boot();