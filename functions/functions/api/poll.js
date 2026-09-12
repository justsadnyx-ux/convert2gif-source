import { readStats } from '../_lib/rate.js';
import { json } from '../_lib/media.js';

const API = 'https://discord.com/api/v10';
const SERVER_REFRESH_MS = 5 * 60 * 1000;

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = request.headers.get('x-poll-secret');
  if (!env.POLL_SECRET || secret !== env.POLL_SECRET) {
    return json({ ok: false, error: 'bad_secret' }, 401);
  }

  const stats = await readStats(env);
  const now = Date.now();
  let servers = stats.serverCount || 0;

  try {
    const lastServerRaw = await env.CONVERT_DATA.get('serverCountCheck');
    const lastServer = lastServerRaw ? parseInt(lastServerRaw, 10) : 0;
    if (now - lastServer >= SERVER_REFRESH_MS && env.BOT_TOKEN) {
      const res = await fetch(`${API}/users/@me/guilds`, {
        headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
      });
      if (res.ok) {
        const guilds = await res.json();
        servers = guilds.length;
        stats.serverCount = servers;
        await writeServerCount(env, servers);
        await env.CONVERT_DATA.put('serverCountCheck', String(now)).catch(() => {});
      }
    }
  } catch (e) {
    // best effort
  }

  const lastPollRaw = await env.CONVERT_DATA.get('lastPoll');
  const lastPoll = lastPollRaw ? parseInt(lastPollRaw, 10) : 0;
  if (now - lastPoll >= 60000) {
    await env.CONVERT_DATA.put('lastPoll', String(now)).catch(() => {});
  }

  return json({
    ok: true,
    processed: 0,
    servers,
    gifCount: stats.gifCount || 0,
    lastPollAgo: now - lastPoll,
  });
}

async function writeServerCount(env, count) {
  const prev = await env.CONVERT_DATA.get('serverCount').catch(() => null);
  if (String(prev) === String(count)) return;
  await env.CONVERT_DATA.put('serverCount', String(count)).catch(() => {});
  await env.CONVERT_DATA.put('serverCountCheck', String(Date.now())).catch(() => {});
}