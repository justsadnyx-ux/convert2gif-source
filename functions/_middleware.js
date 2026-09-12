const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Convert2GIF — Maintenance</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #090b10; color: #f0f2f7; min-height: 100vh;
      display: grid; place-items: center; padding: 24px;
      background-image:
        radial-gradient(1000px 500px at 80% -10%, rgba(45,212,191,0.10), transparent 60%),
        radial-gradient(800px 400px at 0% 90%, rgba(251,146,60,0.07), transparent 55%);
    }
    .wrap { max-width: 560px; text-align: center }
    .logo { display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 800; font-size: 18px; margin-bottom: 28px }
    .logo-text { background: linear-gradient(90deg,#fff,#cbd5e1); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent }
    h1 { font-size: clamp(30px, 6vw, 46px); font-weight: 800; letter-spacing: -1px; margin-bottom: 14px;
      background: linear-gradient(100deg,#2dd4bf,#fb923c); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent }
    p { color: #aab4c6; font-size: 16px; line-height: 1.7; margin-bottom: 12px }
    .badge { display: inline-block; background: rgba(251,146,60,0.12); border: 1px solid rgba(251,146,60,0.35); border-radius: 999px; padding: 7px 16px; font-size: 13px; font-weight: 700; color: #fb923c; margin-bottom: 22px; letter-spacing: 0.4px; text-transform: uppercase }
    .links { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 26px }
    a { color: #2dd4bf; text-decoration: none; font-size: 14px; font-weight: 600; border: 1px solid #262d3d; border-radius: 8px; padding: 9px 16px; transition: border-color .2s, background .2s }
    a:hover { border-color: #2dd4bf; background: rgba(45,212,191,0.06) }
    a.primary { border-color: #5865f2; background: rgba(88,101,242,0.18); color: #818cf8; font-size: 15px; padding: 11px 22px; font-weight: 700; }
    a.primary:hover { border-color: #818cf8; background: rgba(88,101,242,0.28); }
    .foot { color: #6f7a8f; font-size: 12.5px; margin-top: 34px }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">
      <svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true">
        <rect width="100" height="100" rx="22" fill="#14b8a6"/>
        <rect x="24" y="34" width="52" height="44" rx="8" fill="#0b0d12"/>
        <path d="M40 46l20 10-20 10z" fill="#2dd4bf"/>
      </svg>
      <span class="logo-text">Convert2GIF</span>
    </div>
    <span class="badge">Maintenance</span>
    <h1>We're tuning things up</h1>
    <p>The web converter is temporarily disabled while we rebuild it. The <strong>Discord bot</strong> is fully live in the Convert2GIF server — convert images with <code>.gif</code>.</p>
    <div class="links">
      <a href="/discord" class="primary">Join the Discord</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
    </div>
    <p class="foot">Bot is online · Web conversion paused · Join the Discord to use <code>.gif</code>. · Privacy &amp; Terms always available.</p>
  </div>
</body>
</html>`;

const ALLOW_PREFIXES = [
  '/privacy',
  '/terms',
  '/discord',
  '/source',
  '/css/',
  '/js/',
  '/favicon',
  '/img/',
  '/assets/',
  '/robots.txt',
  '/sitemap',
  '/api/',
];

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Keep the bot alive: Discord interaction Webhooks are POST / (and /api/*)
  if (request.method === 'POST' && path === '/') {
    return next();
  }

  if (ALLOW_PREFIXES.some((p) => path.startsWith(p))) {
    // Web conversion is disabled while in maintenance.
    if (path.startsWith('/api/convert')) {
      return new Response(
        JSON.stringify({ error: 'maintenance', msg: 'The web converter is temporarily disabled for maintenance.' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' },
        }
      );
    }
    return next();
  }

  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600' },
  });
}