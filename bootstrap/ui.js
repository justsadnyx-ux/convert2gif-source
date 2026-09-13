export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="theme-color" content="#0b0f14"/>
<link rel="manifest" href="/manifest.json"/>
<link rel="icon" href="/icon.svg"/>
<title>Convert2GIF Bootstrapper</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:#06090d; --panel:#0d131b; --panel2:#111a24; --line:#1e2a38;
  --txt:#e6edf3; --dim:#8b98a5; --teal:#14b8a6; --teal2:#2dd4bf;
  --red:#f87171; --amber:#fbbf24; --green:#34d399;
}
html,body { background:var(--bg); color:var(--txt); font-family:Segoe UI,Roboto,system-ui,sans-serif; min-height:100%; }
body::before { content:""; position:fixed; inset:0; pointer-events:none; background:
  repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px); z-index:9; mix-blend-mode:overlay; }
body::after { content:""; position:fixed; inset:0; pointer-events:none; z-index:10; background:
  radial-gradient(1200px 500px at 50% -10%, rgba(20,184,166,0.12), transparent 60%); }
.wrap { max-width:760px; margin:0 auto; padding:16px; padding-bottom:80px; }
header { display:flex; align-items:center; gap:12px; padding:14px 0 18px; }
.logo { display:flex; align-items:center; gap:10px; }
.logo svg { width:40px; height:40px; filter:drop-shadow(0 0 12px rgba(20,184,166,0.5)); }
h1 { font-size:18px; font-weight:800; letter-spacing:0.3px; }
.sub { color:var(--dim); font-size:11.5px; margin-top:2px; }
.pill { margin-left:auto; font-size:11px; font-weight:700; padding:6px 12px; border-radius:999px; }
.pill.on { background:rgba(52,211,153,0.15); color:var(--green); box-shadow:0 0 12px rgba(52,211,153,0.35); }
.pill.off { background:rgba(248,113,113,0.12); color:var(--red); }
.pill.busy { background:rgba(251,191,36,0.12); color:var(--amber); animation:pulse 1s infinite; }
@keyframes pulse { 50% { opacity:0.5; } }
.card { background:linear-gradient(180deg, var(--panel), var(--panel2)); border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:14px; }
.card h2 { font-size:12px; text-transform:uppercase; letter-spacing:1.2px; color:var(--dim); margin-bottom:12px; font-weight:700; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.stat { background:#0a0f15; border:1px solid var(--line); border-radius:10px; padding:10px; }
.stat .k { font-size:10.5px; color:var(--dim); text-transform:uppercase; letter-spacing:0.8px; }
.stat .v { font-size:15px; font-weight:800; margin-top:3px; }
.stat .v.zerk { color:var(--dim); }
.v.teal { color:var(--teal2); } .v.grn { color:var(--green); } .v.red { color:var(--red); } .v.amb { color:var(--amber); }
.btnrow { display:flex; gap:10px; flex-wrap:wrap; margin-top:6px; }
.btn { flex:1; min-width:120px; border:0; border-radius:12px; padding:14px 10px; font-size:15px; font-weight:800; cursor:pointer; color:#04252a; transition:transform .1s, filter .15s; }
.btn:active { transform:scale(0.97); }
.btn:disabled { opacity:0.45; cursor:not-allowed; }
.btn.start { background:linear-gradient(135deg, var(--teal), var(--teal2)); box-shadow:0 6px 24px rgba(20,184,166,0.35); }
.btn.stop { background:linear-gradient(135deg, #b91c1c, #dc2626); color:#fff; box-shadow:0 6px 24px rgba(220,38,38,0.3); }
.btn.ghost { background:#16202c; color:var(--txt); border:1px solid var(--line); }
.btn.small { padding:9px 10px; font-size:12.5px; min-width:auto; flex:0 1 auto; }
.dotrow { display:flex; gap:8px; margin-top:12px; }
.dot { flex:1; padding:10px 4px; border-radius:10px; border:1px solid var(--line); background:#0a0f15; color:var(--dim); font-size:12px; font-weight:700; cursor:pointer; text-align:center; }
.dot.on { background:rgba(20,184,166,0.16); border-color:var(--teal); color:var(--teal2); box-shadow:0 0 12px rgba(20,184,166,0.2); }
.logbox { background:#04070a; border:1px solid var(--line); border-radius:10px; height:220px; overflow:auto; padding:10px; font-family:Consolas,monospace; font-size:11.5px; line-height:1.55; color:#9fb2c2; white-space:pre-wrap; word-break:break-word; }
.logbox .ok { color:var(--green); } .logbox .bad { color:var(--red); } .logbox .hl { color:var(--teal2); }
.modal { position:fixed; inset:0; background:rgba(4,7,10,0.82); backdrop-filter:blur(6px); display:none; align-items:center; justify-content:center; z-index:60; padding:16px; }
.modal.open { display:flex; }
.modal .box { width:100%; max-width:420px; background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; }
.modal h2 { font-size:16px; margin-bottom:14px; }
label { display:block; font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:1px; margin:12px 0 6px; }
input { width:100%; background:#0a0f15; border:1px solid var(--line); border-radius:10px; padding:11px 12px; color:var(--txt); font-size:13px; outline:none; }
input:focus { border-color:var(--teal); }
.mob { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; }
.codetag { font-family:Consolas,monospace; font-size:12px; color:var(--teal2); background:#0a0f15; border:1px dashed var(--line); border-radius:8px; padding:8px 10px; }
.toast { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); background:#16202c; border:1px solid var(--teal); color:var(--txt); padding:12px 18px; border-radius:12px; font-size:13px; z-index:90; box-shadow:0 8px 30px rgba(0,0,0,0.5); max-width:90vw; display:none; }
input.scene-name { display:none; }
/* cinematic overlay */
.overlay { position:fixed; inset:0; background:#020304; z-index:200; display:none; flex-direction:column; align-items:center; justify-content:center; text-align:center; overflow:hidden; }
.overlay.on { display:flex; }
.overlay .big { font-size:clamp(26px,8vw,64px); font-weight:900; letter-spacing:2px; color:var(--txt); text-shadow:0 0 30px rgba(20,184,166,0.6); }
.overlay .big.goof { color:#fff; animation:glitch 0.5s infinite; }
.overlay .mid { font-size:clamp(15px,4vw,24px); font-weight:800; color:var(--teal2); margin-top:10px; }
.overlay .tiny { font-size:13px; color:var(--dim); margin-top:8px; max-width:80vw; }
.prog { width:min(420px,76vw); height:8px; background:#101a24; border-radius:99px; margin-top:26px; overflow:hidden; }
.prog > i { display:block; height:100%; width:0%; background:linear-gradient(90deg, var(--teal), var(--teal2)); transition:width .3s; box-shadow:0 0 18px var(--teal); }
.overlay .emoji { font-size:54px; animation:pop .35s; margin-bottom:8px; }
@keyframes pop { 0% { transform:scale(0.2); } 70% { transform:scale(1.25); } 100% { transform:scale(1); } }
@keyframes glitch { 0%,100%{transform:translate(0)} 25%{transform:translate(-2px,1px) skewX(3deg)} 50%{transform:translate(2px,-1px)} 75%{transform:translate(-1px,2px) skewX(-4deg)} }
@media (max-width:520px){ .grid2{grid-template-columns:1fr} .btn{min-width:calc(50% - 6px)} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="logo">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" rx="22" fill="#14b8a6"/>
        <rect x="20" y="28" width="60" height="52" rx="10" fill="#06090d"/>
        <path d="M36 44l26 10-26 10z" fill="#2dd4bf"/>
      </svg>
    </span>
    <div>
      <h1>Convert2GIF <span style="color:var(--teal2)">Bootstrappa</span></h1>
      <div class="sub">Hosted by convert2gif.pages.dev · v<span id="ver">?</span></div>
    </div>
    <span class="pill off" id="pill">OFFLINE</span>
  </header>

  <div class="card">
    <h2>🔥 Main control</h2>
    <div class="btnrow">
      <button class="btn start" id="btnStart" disabled>▶ FIRE DA BOT UP</button>
      <button class="btn stop"  id="btnStop"  disabled>⏹ HOLD UP, SHUT IT</button>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div class="stat"><div class="k">Node.js</div><div class="v zerk" id="sNode">?</div></div>
      <div class="stat"><div class="k">App</div><div class="v zerk" id="sApp">?</div></div>
      <div class="stat"><div class="k">Config</div><div class="v zerk" id="sCfg">?</div></div>
      <div class="stat"><div class="k">State</div><div class="v zerk" id="sRun">?</div></div>
    </div>
    <div class="dotrow" id="presence">
      <button class="dot" data-p="online">ONLINE</button>
      <button class="dot" data-p="idle">AWAY</button>
      <button class="dot" data-p="dnd">DND</button>
      <button class="dot" data-p="invisible">INVIS</button>
    </div>
  </div>

  <div class="card">
    <h2>🛠 Setup &amp; fixes</h2>
    <div class="btnrow">
      <button class="btn ghost small" id="btnCfg">🔑 Config (token)</button>
      <button class="btn ghost small" id="btnUpd">🔄 Check update</button>
      <button class="btn ghost small" id="btnRepair">🩹 Repair app</button>
      <button class="btn ghost small" id="btnNode">📦 Install Node</button>
      <button class="btn ghost small" id="btnData">📂 Open data folder</button>
      <button class="btn ghost small" id="btnQuit">🚪 Quit</button>
    </div>
  </div>

  <div class="card">
    <h2>📱 Phone (BETA) — control from your phone</h2>
    <div class="mob">
      <div id="mobileUrl" class="codetag">local only</div>
      <button class="btn small ghost" id="btnCopyUrl">COPY</button>
    </div>
    <p style="font-size:11.5px;color:var(--dim);margin-top:8px">Put this in your phone's browser on the same Wi-Fi. Add to home screen for app mode. Same VIBES as desktop.</p>
  </div>

  <div class="card">
    <h2>📟 Bot live log</h2>
    <div class="logbox" id="logs"></div>
  </div>
</div>

<div class="modal" id="cfgModal">
  <div class="box">
    <h2>🔑 Drop the keys, no cap</h2>
    <label>BOT TOKEN</label>
    <input id="inToken" type="password" placeholder="paste yo token"/>
    <label>CLIENT / APPLICATION ID (digits) — optional</label>
    <input id="inClient" placeholder="e.g. 1547681467176591400"/>
    <div class="btnrow" style="margin-top:16px">
      <button class="btn start" id="btnSaveCfg">SAVE</button>
      <button class="btn ghost" id="btnCloseCfg">NAH</button>
    </div>
  </div>
</div>

<div class="overlay" id="ov">
  <div class="emoji" id="ovEmoji">🎬</div>
  <div class="big" id="ovBig">...</div>
  <div class="mid" id="ovMid"></div>
  <div class="tiny" id="ovTiny"></div>
  <div class="prog"><i id="ovProg"></i></div>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  var TOKEN = (location.hash || '').replace('#', '') || '';
  var st = { running:'stopped', configured:false };
  var logsEl = document.getElementById('logs');
  var autoscroll = true;
  var overlayBusy = false;
  var ws = null;

  function $(id){ return document.getElementById(id); }
  setInterval(function(){ logsEl.scrollTop = logsEl.scrollHeight; }, 1800);

  function beep(f, dur, vol, when) {
    var ctx = window.__ctx;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + 0.05);
  }
  function whoosh() {
    var ctx = window.__ctx;
    var len = ctx.sampleRate * 1.6;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    src.connect(f); f.connect(ctx.destination); src.start();
  }
  function sfx(type) {
    try {
      if (!window.__ctx) window.__ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (window.__ctx.state === 'suspended') window.__ctx.resume();
      if (type === 'click') beep(660, 0.07, 0.12, 0);
      else if (type === 'start') { whoosh(); beep(392,0.14,0.2,0.1); beep(523,0.14,0.2,0.24); beep(659,0.2,0.22,0.38); }
      else if (type === 'success') { beep(523,0.15,0.2,0.05); beep(659,0.15,0.2,0.2); beep(784,0.3,0.22,0.35); }
      else if (type === 'error') { beep(220,0.3,0.2,0); beep(180,0.4,0.2,0.22); }
      else if (type === 'update') { beep(440,0.12,0.2,0); beep(587,0.12,0.2,0.13); beep(880,0.25,0.22,0.26); }
      else if (type === 'warn') { beep(330,0.2,0.2,0); beep(330,0.2,0.2,0.25); }
    } catch (e) {}
  }

  var START_LINES = [
    'AYO WE FIRIN THIS THANG UP','TIME TO MAKE IT RAIN GIFS, SHAWTY',
    'HOLDIN NOTHING BACK — LAUNCHIN NOW','PULL UP. BOT IS ABOUT TO GO CRAZY',
    'ITS GO TIME, NO CAP','WE IN DAY CONSTRUCTING OPERATIONS'
  ];
  var DOWN_LINES = [
    'GRABBIN DA GOODZ OFF DA CLOUD','PULLIN DA PACKAGE — DONT BLINK',
    'DOWNLOADIN HEAT REAL QUICK','FETCHIN DA FIRE, WATCH IT COME DOWN',
    'CALLIN IN REINFORCEMENTS — DAT ZIP','SNAGGIN THE DEAL, PACKAGE INBOUND'
  ];
  var FIX_LINES = [
    'YO DA BOT FLOPPED — WE FIXIN IT BRUH','HEALIN THE WOUNDS, HOL ON',
    'BROKE? WE GONNA UNBROKE IT','REPAIRING DA SOFTWARE, DONT TRIP'
  ];
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }

  function scene(mode, text, sub, tiny) {
    var em = { start:'🚀', download:'💾', fix:'🔧', update:'🚀', ok:'🎉', bad:'💥', lights:'🟢' };
    $('ovEmoji').textContent = em[mode] || '🎬';
    $('ovBig').textContent = text; $('ovBig').classList.toggle('goof', mode==='bad');
    $('ovMid').textContent = sub || '';
    $('ovTiny').textContent = tiny || '';
    $('ovProg').style.width = '8%';
    $('ov').classList.add('on');
    overlayBusy = true;
    if (mode==='start') sfx('start');
    if (mode==='download') sfx('update');
    if (mode==='bad') sfx('error');
  }
  function progress(pct){ $('ovProg').style.width = Math.min(100, pct || 15) + '%'; }
  function sceneDone(ok, text) {
    progress(100);
    setTimeout(function(){
      if (ok!==false) sfx('success');
      $('ovBig').textContent = ok===false ? '🤷 IT FLOPPED BRUH' : (text || 'WE LIVE. NO CAP');
      $('ovMid').textContent = '';
      $('ovTiny').textContent = ok===false ? 'check the log below, we gon figure it out' : '';
      setTimeout(function(){ $('ov').classList.remove('on'); overlayBusy=false; }, ok===false ? 2200 : 1500);
    }, 300);
  }

  function toast(m, isBad) {
    var t = $('toast');
    t.textContent = m;
    t.style.borderColor = isBad ? 'var(--red)' : 'var(--teal)';
    t.style.display = 'block';
    clearTimeout(t.__t);
    t.__t = setTimeout(function(){ t.style.display='none'; }, 3600);
    if (isBad) sfx('error'); else sfx('click');
  }

  function api(path, body) {
    var opt = { headers: { 'x-c2g-token': TOKEN } };
    if (body) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function(r){ if (r.status===403) throw new Error('BAD CODE'); return r.json(); });
  }

  function applyState(s) {
    st = s;
    $('ver').textContent = s.appVersion || '?';
    $('sNode').textContent = (s.nodeVersion ? 'v'+s.nodeVersion : 'MISSING');
    $('sNode').classList.toggle('grn', !!s.nodeVersion);
    $('sNode').classList.toggle('zerk', !s.nodeVersion);
    $('sApp').textContent = s.installed ? 'v'+s.installed : 'none';
    $('sCfg').textContent = s.configured ? '✅ SET' : '❌ NOPE';
    $('sCfg').className = 'v ' + (s.configured ? 'grn' : 'red');
    var run = s.running || 'stopped';
    $('sRun').textContent = run;
    $('sRun').className = 'v ' + (run==='running' ? 'grn' : (run==='starting'||run==='stopping' ? 'amb' : 'zerk'));
    $('btnStart').disabled = s.configured && run==='stopped' ? false : true;
    $('btnStop').disabled = run==='running' ? false : true;
    var pill = $('pill');
    if (run==='running'){ pill.className='pill on'; pill.textContent='● LIVE'; }
    else if (run==='starting'||run==='stopping'){ pill.className='pill busy'; pill.textContent='⏳ BEEP BOOP'; }
    else { pill.className='pill off'; pill.textContent='■ OFFLINE'; }
    var dots = document.querySelectorAll('#presence .dot');
    for (var i=0;i<dots.length;i++) dots[i].classList.toggle('on', dots[i].getAttribute('data-p')===s.presence);
    if (s.flash && s.flash !== lastShown) { lastShown = s.flash; toast(s.flash); }
    if (s.ips && s.ips.length) {
      $('mobileUrl').textContent = 'http://'+s.ips[0]+':'+s.port+'/#'+s.token;
    }
  }
  var lastShown = null;
  var dlOn = false;

  function addLog(line) {
    var esc = String(line).replace(/[<>&]/g, function(c){ return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;'; });
    var div = document.createElement('div');
    if (/fatal|ERR_|Error|failed|flopp/i.test(esc)) div.className='bad';
    else if (/ready|live|connected|success/i.test(esc)) div.className='ok';
    else if (/v\d|update|pulling|downloading/i.test(esc)) div.className='hl';
    div.textContent = esc;
    logsEl.appendChild(div);
    while (logsEl.children.length > 800) logsEl.removeChild(logsEl.firstChild);
  }

  function connectWS() {
    try {
      if (ws) ws.close();
      ws = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws?tok='+TOKEN);
      ws.onmessage = function(e){
        var m = JSON.parse(e.data);
        if (m.t==='state') applyState(m);
        else if (m.t==='log') {
          if (m.lines) { logsEl.innerHTML=''; for (var i=0;i<m.lines.length;i++) addLog(m.lines[i]); }
          else addLog(m.line);
        }
        else if (m.t==='flash') toast(m.msg);
        else if (m.t==='scene'){
          if (m.name==='download'){
            if (m.done){ progress(100); dlOn=false; sceneDone(true); }
            else if (typeof m.pct === 'number'){
              if (!dlOn){ dlOn=true; scene('download','😤 DOWNLINK ACTIVE', pick(DOWN_LINES), 'grabbin from the cloud...'); }
              progress(m.pct);
            } else { if (!dlOn){ dlOn=true; scene('download','😤 DOWNLINK ACTIVE', pick(DOWN_LINES), ''); } }
          }
          else if (m.name==='start'){ scene('start','LAUNCH SEQUENCE','INITIATE '+ pick(START_LINES) +' — HOLD ON'); setTimeout(function(){ sceneDone(true,'BOT IS LIVE. WE EATING GOOD'); }, 2600); }
        }
      };
      ws.onclose = function(){ setTimeout(connectWS, 1500); };
    } catch(e){ setTimeout(connectWS, 1500); }
  }

  function act(op, extra, sceneName) {
    return api('/api/action', Object.assign({ op: op }, extra || {})).then(function(r){
      if (r.ok === false) { toast('nope: ' + (r.why || 'something broke'), true); sceneDone(false); return r; }
      if (sceneName) sceneDone(true);
      return r;
    }).catch(function(e){ toast('big flop: ' + e.message, true); sceneDone(false); });
  }

  // boot
  if (TOKEN) {
    connectWS();
    api('/api/state').then(applyState).catch(function(){});
  } else {
    scene('warning', 'GIVE US DA ACCESS CODE', 'copy it from the desktop panel', '');
    $('ovEmoji').textContent = '🔑';
    $('ovBig').textContent = 'GIVE US DA ACCESS CODE';
    $('ovBig').classList.remove('goof');
    $('ovMid').textContent = 'open the panel on the desktop, copy the code, come back';
    $('ovTiny').textContent = '';
    (function promptCode(){
      var t = prompt('Access code (from the desktop bootstrapper panel):');
      if (t && t.trim()) { location.hash = '#' + t.trim(); location.reload(); }
      else setTimeout(promptCode, 4000);
    })();
  }

  document.getElementById('btnStart').addEventListener('click', function(){ scene('start','LAUNCH SEQUENCE', pick(START_LINES) + ' — BRACE'); act('start', null, false); });
  document.getElementById('btnStop').addEventListener('click', function(){ sfx('click'); act('stop'); toast('shutting it down...'); });
  document.getElementById('btnCfg').addEventListener('click', function(){ sfx('click'); $('cfgModal').classList.add('open'); });
  document.getElementById('btnCloseCfg').addEventListener('click', function(){ sfx('click'); $('cfgModal').classList.remove('open'); });
  document.getElementById('btnSaveCfg').addEventListener('click', function(){
    act('saveConfig', { token: $('inToken').value.trim(), clientId: $('inClient').value.trim() }).then(function(){ $('cfgModal').classList.remove('open'); });
  });
  document.getElementById('btnUpd').addEventListener('click', function(){ sfx('click'); act('checkUpdates'); });
  document.getElementById('btnRepair').addEventListener('click', function(){ scene('fix','AUTO-REPAIR MODE', pick(FIX_LINES), 'this might take a minute'); act('repair', null, true); });
  document.getElementById('btnNode').addEventListener('click', function(){ sfx('click'); scene('download','INSTALLIN DA ENGINE', 'node.js coming down', ''); act('installNode', null, true); });
  document.getElementById('btnData').addEventListener('click', function(){ sfx('click'); act('openData'); });
  document.getElementById('btnQuit').addEventListener('click', function(){ sfx('click'); act('quit'); });
  document.getElementById('btnCopyUrl').addEventListener('click', function(){
    var t = $('mobileUrl').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ toast('copied. send it to yo phone'); });
    else toast(t);
  });
  var dots = document.querySelectorAll('#presence .dot');
  for (var i=0;i<dots.length;i++){
    dots[i].addEventListener('click', function(){ sfx('click'); act('presence', { presence: this.getAttribute('data-p') }); });
  }
  logsEl.addEventListener('scroll', function(){ autoscroll = (logsEl.scrollTop + logsEl.clientHeight >= logsEl.scrollHeight - 40); });
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }
})();
</script>
</body>
</html>
`;