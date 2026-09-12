import { hitLimit, readStats, writeStats } from '../_lib/rate.js';
import { json } from '../_lib/media.js';

const WEB_LIMIT = 10;
const WEB_WINDOW = 10 * 60 * 1000;
const MAX_BODY = 24 * 1024 * 1024;

export async function onRequestPost(context) {
  try {
    return await onConvert(context);
  } catch (e) {
    return json({ allowed: false, error: `crash: ${e && e.message}`, stack: e && e.stack }, 500);
  }
}

async function onConvert(context) {
  const { env, request } = context;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const { limited, remaining } = await hitLimit(env, `web:${ip}`, WEB_LIMIT, WEB_WINDOW);

  if (request.headers.get('x-check-only')) {
    return json({
      allowed: !limited,
      remaining,
      msg: limited
        ? 'Rate limit reached. 10 conversions per 10 minutes.'
        : `${remaining} conversions left this window (10 per 10 min).`,
    });
  }

  if (limited) {
    return json({ allowed: false, remaining: 0, msg: 'Rate limit reached. 10 conversions per 10 minutes.' }, 429);
  }

  let gifBytes = null;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (file) {
      const buf = await file.arrayBuffer();
      if (buf.byteLength > MAX_BODY) {
        return json({ allowed: false, error: 'too_large' }, 413);
      }
      gifBytes = new Uint8Array(buf);
    }
  } catch (e) {
    return json({ allowed: false, error: 'bad_body' }, 400);
  }

  if (!gifBytes || gifBytes.length === 0) {
    return json({ allowed: false, error: 'no_file' }, 400);
  }

  const stats = await readStats(env);
  stats.gifCount += 1;
  stats.lastPoll = Date.now();
  await writeStats(env, stats);

  return json({
    allowed: true,
    remaining,
    gifCount: stats.gifCount,
    bytes: gifBytes.length,
    msg: `${remaining} conversions left this window (10 per 10 min).`,
  });
}