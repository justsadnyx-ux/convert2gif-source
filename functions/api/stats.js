import { readStats } from '../_lib/rate.js';
import { json } from '../_lib/media.js';

export async function onRequestGet(context) {
  const { env } = context;
  const stats = await readStats(env);

  const lastPollRaw = await env.CONVERT_DATA.get('lastPoll');
  const lastPoll = lastPollRaw ? parseInt(lastPollRaw, 10) : stats.lastPoll || 0;
  const online = Date.now() - lastPoll < 5 * 60 * 1000;

  const serverRaw = await env.CONVERT_DATA.get('serverCount');
  const serverCount = serverRaw ? parseInt(serverRaw, 10) : stats.serverCount || 0;

  return json({
    gifCount: stats.gifCount || 0,
    serverCount,
    startedAt: stats.startedAt || Date.now(),
    online,
  });
}