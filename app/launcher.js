// Convert2GIF — Terminal Launcher
//
// Compile into a single .exe with bun:
//   npm install
//   bun build --compile app/launcher.js --outfile Convert2GIF-Terminal.exe
//
// Asks for your Discord bot token + application id, validates them, then boots
// the "/gif"-only bot with "Hosted by" branding.

import readline from 'node:readline/promises';

const HOSTED_BY = 'https://convert2gif.pages.dev/';
const API = 'https://discord.com/api/v10';

const BANNER = `
  ____                      _ _____ ___ _____
 / ___|___  _ __   __ _ ___| |_   _|  _|_   _|
| |   / _ \\| '_ \\ / _\` / __| | | | | | |_ | |
| |__| (_) | | | | (_| \\__ \\_| | | | |  _|| |
 \\____\\___/|_| |_|\\__, |___(_) |_| |_|  |_|
                  |___/       Convert2GIF Terminal
`;

function line() {
  return '  ' + '-'.repeat(54);
}

async function askHidden(rl, question) {
  if (typeof process.stdin.setRawMode !== 'function') {
    return await new Promise((resolve) => {
      const cleanup = () => {
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdin.removeListener('end', onEnd);
      };
      const onData = (d) => { cleanup(); resolve({ value: d.toString().trim(), eof: false }); };
      const onEnd = () => { cleanup(); resolve({ value: '', eof: true }); };
      process.stdout.write(question);
      process.stdin.resume();
      process.stdin.on('data', onData);
      process.stdin.on('end', onEnd);
    });
  }
  process.stdout.write(question);
  const prev = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  const buf = [];
  const onData = (ch) => {
    for (const b of ch) {
      if (b === 13) return;
      if (b === 127 && buf.length) buf.pop();
      else if (b !== 13 && b !== 10) buf.push(b);
    }
    process.stdout.write('\r\u001b[K' + question + '*'.repeat(buf.length));
  };
  return await new Promise((resolve) => {
    const listener = (ch) => {
      try { onData(ch); } catch { /* ignore */ }
      if (ch.includes(13) || ch.includes(10)) {
        process.stdin.removeListener('data', listener);
        process.stdin.setRawMode(prev);
        process.stdout.write('\n');
        resolve({ value: Buffer.from(buf).toString('utf8'), eof: false });
      }
    };
    process.stdin.on('data', listener);
  });
}

async function ask(rl, question) {
  const answer = await rl.question(`${question}`);
  return answer.trim();
}

async function validateToken(token) {
  try {
    const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const me = await res.json();
    return { ok: true, username: me.username || me.id };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

async function main() {
  console.log(BANNER);
  console.log(line());
  console.log(`  Interactive bot launcher - all you get is /gif:`);
  console.log(`   * /gif <image|url>  -> real static GIF file`);
  console.log(`  No servers features, no moderation, nothing else.`);
  console.log(`  Hosted by ${HOSTED_BY}`);
  console.log(line());
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let token = '';
  while (!token) {
    const r = await askHidden(rl, '  Discord bot token: ');
    const candidate = r.value.trim();
    if (!candidate) {
      if (r.eof) {
        console.log('\n  No token given. Exiting.');
        process.exit(0);
      }
      continue;
    }
    process.stdout.write('  Checking token... ');
    const check = await validateToken(candidate);
    if (!check.ok) {
      process.stdout.write(`[FAIL] ${check.detail} - try again.\n\n`);
      continue;
    }
    process.stdout.write(`[OK] logged in as ${check.username}\n`);
    token = candidate;
  }

  let clientId = '';
  while (!/^\d+$/.test(clientId)) {
    const raw = await ask(rl, '  Application / Client ID (Developer Portal -> General): ');
    if (!raw && (process.stdin.destroyed || process.stdin.readableEnded)) {
      console.log('\n  No Client ID given. Exiting.');
      process.exit(0);
    }
    clientId = raw.trim();
  }

  process.env.BOT_TOKEN = token;
  process.env.DISCORD_CLIENT_ID = clientId;
  process.env.HOSTED_BY = HOSTED_BY;
  rl.close();

  console.log('');
  console.log(line());
  console.log('  Booting the "/gif"-only bot - press Ctrl+C to stop.');
  console.log(line());
  console.log('');

  await import('../selfhost/index.js');
}

main().catch((e) => {
  console.error('\n  Launcher error:', e.message);
  process.exit(1);
});