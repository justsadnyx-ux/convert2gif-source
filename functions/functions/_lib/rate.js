export async function hitLimit(env, key, limit, windowMs = 60000) {
  const now = Date.now();
  const bucketKey = `rl:${key}:${Math.floor(now / windowMs)}`;
  const raw = await env.CONVERT_DATA.get(bucketKey);
  const count = raw ? parseInt(raw, 10) : 0;
  const remaining = count >= limit ? 0 : limit - count - 1;
  if (count >= limit) {
    return { limited: true, remaining };
  }
  const next = count + 1;
  try {
    await env.CONVERT_DATA.put(bucketKey, String(next), {
      expirationTtl: Math.max(Math.ceil(windowMs / 1000), 60) + 1,
    });
  } catch (e) {
    return { limited: false, remaining, kvDown: true };
  }
  return { limited: false, remaining: limit - next };
}

export async function readStats(env) {
  const raw = await env.CONVERT_DATA.get('stats', { type: 'json' });
  return (
    raw || {
      gifCount: 0,
      serverCount: 0,
      startedAt: Date.now(),
      lastPoll: 0,
    }
  );
}

export async function writeStats(env, stats) {
  await env.CONVERT_DATA.put('stats', JSON.stringify(stats));
}