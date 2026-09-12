const GITHUB_REPO = 'https://github.com/justsadnyx-ux/convert2gif-source';

const SOURCE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Convert2GIF Source</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: #090b10; color: #f0f2f7; min-height: 100vh;
      display: grid; place-items: center; padding: 24px;
      background-image:
        radial-gradient(1000px 500px at 80% -10%, rgba(45,212,191,0.10), transparent 60%),
        radial-gradient(800px 400px at 0% 90%, rgba(251,146,60,0.07), transparent 55%);
    }
    .wrap { max-width: 620px; width: 100%; text-align: center }
    .logo { display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 800; font-size: 18px; margin-bottom: 26px }
    .logo-text { background: linear-gradient(90deg,#fff,#cbd5e1); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent }
    h1 { font-size: clamp(26px, 5vw, 40px); font-weight: 800; letter-spacing: -1px; margin-bottom: 12px;
      background: linear-gradient(100deg,#2dd4bf,#fb923c); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent }
    p { color: #aab4c6; font-size: 15px; line-height: 1.7; margin-bottom: 10px }
    code { background: #151a24; border: 1px solid #262d3d; border-radius: 6px; padding: 2px 7px; font-size: 13px; color: #9fe8d8; word-break: break-all }
    .card { background: #0f131b; border: 1px solid #232b3a; border-radius: 14px; padding: 22px; margin: 20px 0; text-align: left }
    .card .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #1a2130; font-size: 14px }
    .card .row:last-child { border-bottom: none }
    .card .k { color: #7b8699 }
    .card .v { color: #e2e8f0; text-align: right }
    .dl { display: inline-block; margin-top: 6px; background: #2dd4bf; color: #06221d; font-weight: 800; font-size: 15px;
      padding: 13px 30px; border-radius: 10px; text-decoration: none; letter-spacing: 0.3px }
    .dl:hover { background: #5eead4 }
    .hosted { color: #6f7a8f; font-size: 12.5px; margin-top: 26px }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">
      <svg viewBox="0 0 100 100" width="32" height="32" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#14b8a6"/><rect x="24" y="34" width="52" height="44" rx="8" fill="#0b0d12"/><path d="M40 46l20 10-20 10z" fill="#2dd4bf"/></svg>
      <span class="logo-text">Convert2GIF Source</span>
    </div>
    <h1>Self-host the full bot</h1>
    <p>Fork-free. Direct download. Source is public — grab it from our repo, or the <b>'/gif'-only</b> terminal launcher (<code>.exe</code>) if you just want a tiny bot.</p>
    <div class="card">
      <div class="row"><span class="k">Bot source (gateway poller)</span><span class="v">✔ included</span></div>
      <div class="row"><span class="k">Website source (Pages + Functions)</span><span class="v">✔ included</span></div>
      <div class="row"><span class="k">Terminal launcher (.exe)</span><span class="v">✔ included</span></div>
      <div class="row"><span class="k">'/gif'-only self-host bot</span><span class="v">✔ included</span></div>
      <div class="row"><span class="k">Setup guide</span><span class="v">✔ included</span></div>
    </div>
    <a class="dl" href="_GITHUB_REPO_">⬇ Open the source repository</a>
    <p class="hosted">Hosted by convert2gif.pages.dev</p>
  </div>
</body>
</html>`;

function pageHtml() {
  return SOURCE_PAGE_HTML.replace('_GITHUB_REPO_', GITHUB_REPO);
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';

  const expected = await env.CONVERT_DATA.get('sourcecode').catch(() => null);
  if (!expected) {
    return new Response('Source download is not ready yet.', { status: 404 });
  }

  if (code && code === expected) {
    return Response.redirect(GITHUB_REPO, 302);
  }

  return new Response(pageHtml(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}