import nacl from 'tweetnacl';
import {
  downloadAttachment,
  imageToGif,
  imageExt,
  imgInfo,
  isSupportedImage,
  isUnsupported,
  rasterizeForAI,
  json,
} from './media.js';
import { hitLimit, readStats, writeStats } from './rate.js';

const API = 'https://discord.com/api/v10';
const MAIN_GUILD_ID = '<YOUR_SERVER_ID>';
const INFO_CHANNEL_ID = '<YOUR_INFO_CHANNEL_ID>';
const ABUSE_CHANNEL_ID = '<YOUR_MODLOG_CHANNEL_ID>';
const OWNER_IDS = '<YOUR_DISCORD_USER_ID>';
const CLIENT_ID = '<YOUR_APPLICATION_ID>';
const VERIFIED_ROLE_ID = '<YOUR_VERIFIED_ROLE_ID>';
const UNVERIFIED_ROLE_ID = '<YOUR_UNVERIFIED_ROLE_ID>';
const INVITE_URL = 'https://discord.gg/<YOUR_INVITE_CODE>';
const BOT_ADD_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot&permissions=121856`;
const GENERAL_LIMIT = 5;
const GENERAL_WINDOW = 15 * 1000;
const GIF_LIMIT = 3;
const GIF_WINDOW = 10 * 60 * 1000;

const COLORS = {
  blurple: 0x5865f2,
  green: 0x23a55a,
  red: 0xf23f43,
  gold: 0xfaa61a,
  dark: 0x2b2d31,
};

const AI_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const NSFW_RE_TEST = /\b(yes|explicit|nude|naked|porn|pornographic|nsfw|sexual|sexualized|sexually|erotic|intercourse|masturbat|hentai|underage)\b/i;

function embed(title, description, color = COLORS.blurple, fields = []) {
  const e = { color, title, description };
  if (fields.length) e.fields = fields;
  return e;
}

function errorEmbed(title, description) {
  return embed(title, description, COLORS.red);
}

function verifySignature(request, rawBody) {
  const publicKey = request.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return false;
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToBytes(signature),
      hexToBytes(publicKey)
    );
  } catch (e) {
    return false;
  }
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function isOwner(userId) {
  return String(OWNER_IDS)
    .split(/[\s,]+/)
    .includes(String(userId));
}

function interactionUser(interaction) {
  return interaction.member?.user || interaction.user || null;
}

function interactionUserId(interaction) {
  return interaction.member?.user?.id || interaction.user?.id || '';
}

async function postToChannel(env, channelId, payload) {
  const res = await fetch(`${API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`post_${res.status}`);
  return (await res.json().catch(() => ({}))) || {};
}

async function patchMessage(env, channelId, messageId, payload) {
  const res = await fetch(`${API}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

async function addReaction(env, channelId, messageId, emoji) {
  const res = await fetch(
    `${API}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    {
      method: 'PUT',
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
    }
  );
  return res.ok;
}

async function logSlashCommand(env, interaction, name) {
  const user = interactionUser(interaction);
  if (!user) return;
  const options = interaction.data?.options || [];
  const optText = options.length
    ? options.map((o) => `\`${o.name}=${typeof o.value === 'string' ? o.value.trim().slice(0, 60) : o.value}\``).join(' ')
    : '-';
  const channel = interaction.channel_id ? `<#${interaction.channel_id}>` : 'DM';
  await postToChannel(env, ABUSE_CHANNEL_ID, {
    embeds: [
      {
        color: 0x5865f2,
        title: '📋 Command',
        description: `**User:** <@${user.id}> \`${user.username}\`\n**Channel:** ${channel}\n**Command:** \`/${name}\`\n**Options:** ${optText}`,
        footer: { text: `<t:${Math.floor(Date.now() / 1000)}:R>` },
      },
    ],
  });
}

export async function handleInteractionRequest(context) {
  const { env, request } = context;
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  const rawBody = await request.text();
  if (!verifySignature({ env, headers: request.headers }, rawBody)) {
    return json({ error: 'bad_signature' }, 401);
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch (e) {
    return json({ error: 'bad_body' }, 400);
  }

  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  if (interaction.type === 3) {
    return handleComponentInteraction(env, interaction);
  }

  if (interaction.type === 2) {
    const name = interaction.data?.name || '';
    const userId = interaction.member?.user?.id || interaction.user?.id;
    if (!userId) return json({ error: 'no_user' }, 400);

    const member = await isServerMember(env, userId);
    if (!member) {
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed(
            '🔒 Convert2GIF Membership Required',
            'To use this bot you must be a member of the **Convert2GIF** server.\n\n🔗 **Join: https://discord.gg/<YOUR_INVITE_CODE>**\n\nLeaving the server revokes access until you rejoin.',
            COLORS.red
          )],
        },
      });
    }

    await logSlashCommand(env, interaction, name).catch(() => {});

    await brushStats(env);

    const stats = await readStats(env);

    if (name === 'gif') {
      return handleGifInteraction(env, interaction, stats);
    }

    if (name === 'imginfo') {
      return handleImgInfoInteraction(env, interaction);
    }

    if (name === 'help') {
      return json({
        type: 4,
        data: {
          embeds: [embed(
            'Convert2GIF Commands',
            'All commands are **slash commands** — prefix commands are retired.',
            COLORS.blurple,
            [
              { name: '🎬 /gif', value: 'Turn an **image** into a real **static GIF file** (no motion). Use **Attach a file** or pass `url:` — **images only**.', inline: false },
              { name: '🔍 /imginfo', value: 'Show an image\'s type, dimensions, and size — attach a file or pass `url:`.', inline: false },
              { name: '👤 /avatar', value: 'Show your avatar — or someone else\'s: `/avatar @user`.', inline: true },
              { name: '👥 /userinfo', value: 'Member info — join date, roles, and more.', inline: true },
              { name: '🏠 /serverinfo', value: 'Info about the current server.', inline: true },
              { name: '🏆 /top', value: 'Leaderboard of top GIF converters.', inline: true },
              { name: '🎱 /8ball', value: 'Ask the magic 8-ball a question.', inline: true },
              { name: '🏓 /ping', value: 'Check bot latency.', inline: true },
              { name: '📖 /help', value: 'Show this help message.', inline: true },
              { name: '⏱️ /uptime', value: 'How long the bot has been running.', inline: true },
              { name: '📊 /stats', value: 'Live conversion count and server count.', inline: true },
              { name: 'ℹ️ /about', value: 'About the bot and Invite links.', inline: true },
              { name: '🔗 /invite', value: 'Server and bot invite links.', inline: true },
              { name: '⚡ 🎬 reaction', value: 'In **any server** the bot is in (except this one), react with 🎬 to any image and the bot auto-converts it to a GIF.', inline: false },
              { name: '👑 Owner tools', value: '`/announce <text>` posts to the info channel. `/poll` starts a reaction poll. `/testnsfw <url|file>` tests the NSFW AI filter.', inline: false },
              { name: '🔒 Membership required', value: `The bot works anywhere, but you must be a member of the **Convert2GIF** server to use commands — join: ${INVITE_URL}`, inline: false },
              { name: '🛡️ Moderation', value: 'Banned words, reactions, scam/spam links, invite links, NSFW images, and spam are auto-moderated. ⚠️ marks violations; repeat offenders get timed out.', inline: false },
              { name: '\u200b', value: `*Rate limit: ${GIF_LIMIT} GIF conversions per 10 minutes per user.*`, inline: false },
              { name: '🏠 Hosted by', value: `[convert2gif.pages.dev](https://convert2gif.pages.dev/)`, inline: false },
            ]
          )],
        },
      });
    }

    if (name === 'uptime') {
      const secs = Math.floor((Date.now() - (stats.startedAt || Date.now())) / 1000);
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      const parts = [];
      if (d) parts.push(`${d}d`);
      if (h) parts.push(`${h}h`);
      if (m) parts.push(`${m}m`);
      parts.push(`${s}s`);
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed(
            'Uptime',
            `\`${parts.join(' ')}\``,
            COLORS.green,
            [{ name: 'Since', value: `<t:${Math.floor((stats.startedAt || Date.now()) / 1000)}:R>`, inline: true }]
          )],
        },
      });
    }

    if (name === 'stats') {
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed(
            'Live Stats',
            '',
            COLORS.blurple,
            [
              { name: '🎬 GIFs Converted', value: `**${(stats.gifCount || 0).toLocaleString()}**`, inline: true },
              { name: '🖥️ Servers', value: `**${(stats.serverCount || 0).toLocaleString()}**`, inline: true },
              { name: '🟢 Status', value: '**Online**', inline: true },
            ]
          )],
        },
      });
    }

    if (name === 'ping') {
      let latency = null;
      try {
        const start = Date.now();
        await fetch(`${API}/users/@me`, {
          headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
        });
        latency = Date.now() - start;
      } catch (e) {
        latency = null;
      }
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed(
            'Pong!',
            latency ? `🏓 API latency: **\`${latency}ms\`**` : '🏓 Pong!',
            COLORS.green
          )],
        },
      });
    }

    if (name === 'top') {
      return handleTopCommand(env);
    }

    if (name === 'invite') {
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed(
            'Invite Convert2GIF',
            '',
            COLORS.blurple,
            [
              { name: '🌐 Join the Convert2GIF server', value: INVITE_URL, inline: false },
              { name: '🤖 Add the bot', value: BOT_ADD_URL, inline: false },
              { name: 'Membership required', value: 'To use the bot you must be a member of the Convert2GIF server. Leaving revokes access until you rejoin.', inline: false },
            ]
          )],
        },
      });
    }

    if (name === 'about') {
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed(
            'About Convert2GIF',
            'Turns **images** into real **static GIF files** — instantly, in Discord.',
            COLORS.blurple,
            [
              { name: '❓ What is it?', value: 'Attach a **PNG, JPG, or GIF**, use `/gif`, and get back a real `.gif` file. Works in any server or DM — everyone can use it.', inline: false },
              { name: '😀 Live anywhere', value: 'Join the Convert2GIF server once and use the bot everywhere. Leaving revokes access.', inline: false },
              { name: '🔓 Open Source', value: 'Coming **VERY soon** — the source will be public on GitHub.', inline: false },
              { name: '👑 Owner', value: '<@<YOUR_DISCORD_USER_ID>>', inline: true },
              { name: '🖥️ Servers', value: `**${(stats.serverCount || 0).toLocaleString()}**`, inline: true },
              { name: '🎬 GIFs Converted', value: `**${(stats.gifCount || 0).toLocaleString()}**`, inline: true },
              { name: '🔗 Server', value: INVITE_URL, inline: false },
            ]
          )],
        },
      });
    }

    if (name === '8ball') {
      const question = (interaction.data?.options?.find((o) => o.name === 'question')?.value || '').trim();
      if (!question) {
        return json({
          type: 4,
          data: { flags: 64, embeds: [errorEmbed('Ask Something', 'Give the 8-ball a `question:`.')] },
        });
      }
      const answers = [
        'Yes.', 'No.', 'Maybe.', 'Without a doubt.', 'Don\'t count on it.',
        'Ask again later.', 'Outlook not so good.', 'Signs point to yes.',
        'Very doubtful.', 'As I see it, yes.', 'My reply is no.', 'Cannot predict now.',
        'Absolutely.', 'Not a chance.', 'It is certain.', 'Better not tell you now.',
      ];
      const pick = answers[Math.floor(Math.random() * answers.length)];
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed('🎱 The 8-Ball', `**Q:** ${question}\n\n**A:** ${pick}`, COLORS.blurple)],
        },
      });
    }

    if (name === 'serverinfo') {
      return handleServerInfo(env, interaction);
    }

    if (name === 'userinfo') {
      return handleUserInfo(env, interaction);
    }

    if (name === 'announce') {
      return handleOwnerAnnounce(env, interaction, userId);
    }

    if (name === 'poll') {
      return handleOwnerPoll(env, interaction, userId);
    }

    if (name === 'testnsfw') {
      return handleTestNsfw(env, interaction, userId);
    }

    if (name === 'avatar') {
      const target =
        (interaction.data?.resolved?.users &&
          Object.values(interaction.data.resolved.users)[0]) ||
        interaction.member?.user ||
        interaction.user;
      const avatarUrl = target && target.avatar
        ? `https://cdn.discordapp.com/avatars/${target.id}/${target.avatar}.png?size=256`
        : null;
      if (!avatarUrl) {
        return json({
          type: 4,
          data: { flags: 64, embeds: [errorEmbed('No Avatar', 'Could not resolve an avatar for that user.')] },
        });
      }
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: COLORS.blurple,
            title: `${target.username}'s avatar`,
            description: avatarUrl,
            image: { url: avatarUrl },
          }],
        },
      });
    }

    return json({ type: 4, data: { flags: 64, embeds: [errorEmbed('Unknown Command', `\`/${name}\` is not a Convert2GIF command.`)] } });
  }

  return json({ error: 'unsupported' }, 400);
}

async function handleTestNsfw(env, interaction, userId) {
  if (!isOwner(userId)) {
    return json({ type: 4, data: { flags: 64, embeds: [errorEmbed('Owner Only', 'Only the server owner can use this command.')] } });
  }
  const opts = interaction.data?.options || [];
  const urlOpt = opts.find((o) => o.name === 'url');
  const url = urlOpt?.value;
  const fileOpt = opts.find((o) => o.name === 'file');
  const fileUrl = fileOpt?.value;
  const filename = fileOpt?.filename || (url ? url.split('/').pop().split('?')[0].split('#')[0] || 'test-image' : 'test-image');
  if (!fileUrl && !url) {
    return json({ type: 4, data: { flags: 64, embeds: [errorEmbed('Missing Image', 'Pass a direct `url:` or attach a file with the **Attach a file** button.')] } });
  }
  const defer = { type: 5, data: { flags: 64 } };
  await callback(env, interaction.id, interaction.token, defer).catch(() => {});
  await editResponse(env, interaction.token, embed('NSFW Test', `Analyzing \`${filename}\` with AI moderation...`, COLORS.gold)).catch(() => {});
  try {
    const data = await downloadAttachment(fileUrl || url);
    const bytes = new Uint8Array(data);
    let aiBytes;
    try {
      const raster = rasterizeForAI(bytes, filename);
      if (!raster) throw new Error('decode_failed');
      aiBytes = raster.png;
    } catch (e) {
      await editResponse(env, interaction.token, errorEmbed('Unreadable Image', 'Could not decode that file. Supported: **PNG, JPG, GIF**.')).catch(() => {});
      return json({ ok: true });
    }
    let bin = '';
    for (let i = 0; i < aiBytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, aiBytes.subarray(i, i + 0x8000));
    }
    const dataUri = `data:image/png;base64,${btoa(bin)}`;
    const result = await env.AI.run(AI_MODEL, {
      prompt: 'Is this image sexually explicit, NSFW, pornographic, or depicting nudity? Reply with only YES or NO.',
      image: dataUri,
    });
    const out = (result && result.description || '').toLowerCase();
    const flagged = NSFW_RE_TEST.test(out);
    const fields = [
      { name: 'Result', value: flagged ? '🔴 **FLAGGED — NSFW**' : '🟢 **CLEAN**', inline: false },
      { name: 'AI Reasoning', value: (result && result.description || '*no response*').slice(0, 900), inline: false },
    ];
    await editResponse(env, interaction.token, embed('NSFW Filter Test', `The moderation pipeline would ${flagged ? '**delete** this message, **forward** it to the mod log, and **DM** the sender' : '**allow** this message through'}.`, flagged ? COLORS.red : COLORS.green, fields)).catch(() => {});
    return json({ ok: true });
  } catch (e) {
    await editResponse(env, interaction.token, errorEmbed('Test Failed', `Could not run the NSFW test: ${String(e && e.message || e).slice(0, 200)}`)).catch(() => {});
    return json({ ok: true });
  }
}

async function handleComponentInteraction(env, interaction) {
  const id = String(interaction.data?.custom_id || '');
  if (id === 'verify:panel') {
    return handleVerifyPanel(env, interaction);
  }
  return json({ type: 4, data: { flags: 64, content: 'Unknown button.' } });
}

async function handleVerifyPanel(env, interaction) {
  if (interaction.guild_id !== MAIN_GUILD_ID) {
    return json({ type: 4, data: { flags: 64, content: 'This panel only works in the Convert2GIF server.' } });
  }
  const member = interaction.member;
  const uid = member?.user?.id;
  if (!uid) {
    return json({ type: 4, data: { flags: 64, content: 'Could not identify you.' } });
  }
  const currentRoles = member?.roles || [];
  if (currentRoles.includes(VERIFIED_ROLE_ID)) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [embed('✅ Already Verified', `You're already verified, <@${uid}>! Enjoy the server.`, COLORS.green)] },
    });
  }

  const targetRoles = currentRoles.filter((r) => r !== UNVERIFIED_ROLE_ID);
  targetRoles.push(VERIFIED_ROLE_ID);

  const joinedAt = member?.joined_at || null;
  await env.CONVERT_DATA
    .put(`gverify:${MAIN_GUILD_ID}:${uid}`, JSON.stringify({ at: Date.now(), joinedAt }))
    .catch(() => {});

  try {
    const res = await fetch(`${API}/guilds/${MAIN_GUILD_ID}/members/${uid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: targetRoles }),
    });
    if (!res.ok) throw new Error(`role_${res.status}`);
  } catch (e) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Verification Failed', 'Could not update your roles. Try again in a moment.')] },
    });
  }

  await postToChannel(env, ABUSE_CHANNEL_ID, {
    embeds: [{
      color: 0x23a55a,
      title: '✅ User Verified',
      description: `<@${uid}> completed verification via the panel.`,
      footer: { text: `<t:${Math.floor(Date.now() / 1000)}:R>` },
    }],
  }).catch(() => {});

  return json({
    type: 4,
    data: {
      flags: 64,
      embeds: [embed(
        '✅ Verified!',
        `Welcome to **Convert2GIF**, <@${uid}>! 🎉\n\nYou now have the **Verified** role — you can chat in **#general** and use **/help** / **/gif**.`,
        COLORS.green
      )],
    },
  });
}

async function isServerMember(env, userId) {
  try {
    const res = await fetch(`${API}/guilds/${MAIN_GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function brushStats(env) {
  const stats = await readStats(env);
  const now = Date.now();
  try {
    const res = await fetch(`${API}/users/@me/guilds`, {
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
    });
    if (res.ok) {
      const guilds = await res.json();
      if (guilds.length !== stats.serverCount) {
        stats.serverCount = guilds.length;
        await env.CONVERT_DATA.put('serverCount', String(guilds.length)).catch(() => {});
      }
    }
  } catch (e) {
    // best effort
  }
  const lastPollRaw = await env.CONVERT_DATA.get('lastPoll').catch(() => null);
  const lastPoll = lastPollRaw ? parseInt(lastPollRaw, 10) : 0;
  if (now - lastPoll >= 60000) {
    stats.lastPoll = now;
    await env.CONVERT_DATA.put('lastPoll', String(now)).catch(() => {});
  }
}

async function handleGifInteraction(env, interaction, stats) {
  const userId = interaction.member?.user?.id || interaction.user?.id;

  const rl = await hitLimit(env, `usergif:${userId}`, GIF_LIMIT, GIF_WINDOW);
  if (rl.limited) {
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [errorEmbed(
          'Rate Limited',
          `You've hit the GIF conversion limit of **${GIF_LIMIT} per 10 minutes**. Try again shortly.`
        )],
      },
    });
  }

  const gifOption = interaction.data?.options?.find((o) => o.name === 'file');
  const urlOption = interaction.data?.options?.find((o) => o.name === 'url');

  const url = urlOption?.value;
  const fileUrl = gifOption?.value;
  const filename = gifOption?.filename || (url ? url.split('/').pop().split('?')[0].split('#')[0] || 'image-from-url' : 'attachment.gif');

  if (!fileUrl && !url) {
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [errorEmbed(
          'Missing Attachment',
          'Use the **Attach a file** button above the input box when running `/gif`, or pass a direct `url:`.'
        )],
      },
    });
  }

  const defer = { type: 5, data: { flags: 64 } };
  await callback(env, interaction.id, interaction.token, defer).catch(() => {});

  const headers = { Authorization: `Bot ${env.BOT_TOKEN}` };

  try {
    const ext = imageExt(filename);
    if (!isSupportedImage(ext)) {
      const msg = isUnsupported(ext)
        ? `\`${ext.toUpperCase()}\` isn't supported by the bot.\n\nAttach with **PNG, JPG, or GIF** — images only.`
        : 'That file type is not supported.';
      await editResponse(env, interaction.token, embed('Unsupported', msg, COLORS.red));
      return json({ ok: true });
    }

    await editResponse(env, interaction.token, embed(
      'Converting...',
      `Processing \`${filename}\`...`,
      COLORS.gold
    ));

    const data = await downloadAttachment(fileUrl || url);
    const gifBytes = imageToGif(data, filename, 360);
    if (!gifBytes || gifBytes.length === 0) {
      await editResponse(env, interaction.token, errorEmbed('Failed', 'Could not read or decode that file.'));
      return json({ ok: true });
    }

    stats.gifCount = (stats.gifCount || 0) + 1;
    await writeStats(env, stats);
    try {
      const raw = await env.CONVERT_DATA.get('userCounts');
      const counts = raw ? JSON.parse(raw) : {};
      counts[userId] = (counts[userId] || 0) + 1;
      await env.CONVERT_DATA.put('userCounts', JSON.stringify(counts));
    } catch (e) {
      // best effort
    }

    const kb = (gifBytes.length / 1024).toFixed(1);
    const fields = [
      { name: 'File', value: `\`${filename}\``, inline: true },
      { name: 'Size', value: `\`${kb} KB\``, inline: true },
    ];
    const info = imgInfo(data, filename);
    if (info.width && info.height) {
      fields.push({ name: 'Dimensions', value: `\`${info.width}×${info.height}\``, inline: true });
    }
    if (ext === 'gif' && info.animated !== undefined) {
      fields.push({ name: 'Type', value: info.animated ? '`Animated GIF`' : '`Static GIF`', inline: true });
    }
    fields.push({ name: 'Total Converted', value: `**${stats.gifCount.toLocaleString()}**`, inline: true });
    await editResponse(env, interaction.token, embed(
      'Conversion Complete',
      '',
      COLORS.green,
      fields
    ), gifBytes);

    return json({ ok: true });
  } catch (e) {
    await editResponse(env, interaction.token, errorEmbed(
      'Conversion Failed',
      'Could not convert that file. Attach or reply with a **PNG, JPG, or GIF** image.'
    )).catch(() => {});
    return json({ ok: true });
  }
}

async function handleTopCommand(env) {
  try {
    const raw = await env.CONVERT_DATA.get('userCounts');
    const counts = raw ? JSON.parse(raw) : {};
    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    if (!sorted.length) {
      return json({
        type: 4,
        data: {
          flags: 64,
          embeds: [embed('🏆 Top Converters', 'No conversions recorded yet.', COLORS.blurple)],
        },
      });
    }
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const lines = sorted
      .map(([uid, n], i) => `${medals[i]} <@${uid}> — **${n.toLocaleString()}**`)
      .join('\n');
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [embed('🏆 Top Converters', lines, COLORS.gold)],
      },
    });
  } catch (e) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Error', 'Could not load leaderboard.')] },
    });
  }
}

async function handleImgInfoInteraction(env, interaction) {
  const gifOption = interaction.data?.options?.find((o) => o.name === 'file');
  const urlOption = interaction.data?.options?.find((o) => o.name === 'url');

  const url = urlOption?.value;
  const fileUrl = gifOption?.value;
  const filename = gifOption?.filename || (url ? url.split('/').pop().split('?')[0].split('#')[0] || 'image-from-url' : 'attachment.gif');

  if (!fileUrl && !url) {
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [errorEmbed(
          'Missing Attachment',
          'Attach an image or pass a direct `url:` to inspect.'
        )],
      },
    });
  }

  const defer = { type: 5, data: { flags: 64 } };
  await callback(env, interaction.id, interaction.token, defer).catch(() => {});

  try {
    const data = await downloadAttachment(fileUrl || url);
    const info = imgInfo(data, filename);
    const kb = (data.length / 1024).toFixed(1);
    const fields = [
      { name: 'File', value: `\`${filename}\``, inline: true },
      { name: 'Type', value: `\`${info.type}\``, inline: true },
      { name: 'Size', value: `\`${kb} KB\``, inline: true },
    ];
    if (info.width && info.height) {
      fields.push({ name: 'Dimensions', value: `\`${info.width}×${info.height}\``, inline: true });
    }
    if (info.animated !== undefined) {
      fields.push({ name: 'Animation', value: info.animated ? '`Animated`' : '`Static`', inline: true });
    }
    await editResponse(env, interaction.token, embed('Image Info', '', COLORS.blurple, fields));
    return json({ ok: true });
  } catch (e) {
    await editResponse(env, interaction.token, errorEmbed('Failed', 'Could not fetch info for that file.')).catch(() => {});
    return json({ ok: true });
  }
}

async function handleServerInfo(env, interaction) {
  const guildId = interaction.guild_id || MAIN_GUILD_ID;
  try {
    const res = await fetch(`${API}/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
    });
    if (!res.ok) throw new Error(`guild_${res.status}`);
    const g = await res.json();
    const created = Number((BigInt(g.id) >> 22n) + 1420070400000n);
    const verification = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Highest' }[g.verification_level] || 'None';
    const boostTier = { 0: 'None', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' }[g.premium_tier] || 'None';
    const iconUrl = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=256` : null;
    const members = g.approximate_member_count ?? g.member_count ?? 0;
    const emb = {
      color: COLORS.blurple,
      title: `🏠 ${g.name}`,
      description: g.description ? g.description.slice(0, 1024) : null,
      thumbnail: iconUrl ? { url: iconUrl } : null,
      fields: [
        { name: 'Owner', value: `<@${g.owner_id}>`, inline: true },
        { name: 'Members', value: `**${members.toLocaleString()}**`, inline: true },
        { name: 'Boost Tier', value: boostTier, inline: true },
        { name: 'Boosts', value: `**${g.premium_subscription_count || 0}**`, inline: true },
        { name: 'Verification', value: verification, inline: true },
        { name: 'Roles', value: `**${(g.roles || []).length}**`, inline: true },
        { name: 'Emojis', value: `**${(g.emojis || []).length}**`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(created / 1000)}:R>`, inline: true },
        { name: 'ID', value: `\`${g.id}\``, inline: true },
      ],
    };
    if (!emb.description) delete emb.description;
    if (!emb.thumbnail) delete emb.thumbnail;
    return json({ type: 4, data: { flags: 64, embeds: [emb] } });
  } catch (e) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Error', 'Could not fetch server info.')] },
    });
  }
}

async function handleUserInfo(env, interaction) {
  const userOption = interaction.data?.options?.find((o) => o.name === 'user');
  const resolved = interaction.data?.resolved?.users;
  const target = userOption && resolved ? Object.values(resolved)[0] : interactionUser(interaction);
  if (!target) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('No User', 'Could not resolve that user.')] },
    });
  }
  const targetId = target.id;
  try {
    const res = await fetch(`${API}/guilds/${MAIN_GUILD_ID}/members/${targetId}`, {
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
    });
    const member = res.ok ? await res.json() : null;
    const created = Number((BigInt(targetId) >> 22n) + 1420070400000n);
    const avatarUrl = member && member.avatar
      ? `https://cdn.discordapp.com/guilds/${MAIN_GUILD_ID}/users/${targetId}/${member.avatar}.png?size=256`
      : target.avatar
        ? `https://cdn.discordapp.com/avatars/${targetId}/${target.avatar}.png?size=256`
        : null;
    const nickname = (member && member.nick) || target.username;
    const roles = (member && member.roles) || [];
    const fields = [];
    if (member) {
      fields.push({ name: 'Joined Server', value: member.joined_at ? `<t:${Math.floor(new Date(member.joined_at).getTime() / 1000)}:R>` : '—', inline: true });
      fields.push({ name: 'Boosting Since', value: member.premium_since ? `<t:${Math.floor(new Date(member.premium_since).getTime() / 1000)}:R>` : '—', inline: true });
      fields.push({
        name: 'Roles',
        value: roles.length
          ? `${roles.slice(0, 10).map((r) => `<@&${r}>`).join(' ')}${roles.length > 10 ? ` +${roles.length - 10} more` : ''}`
          : '—',
        inline: false,
      });
    }
    fields.push({ name: 'Bot', value: target.bot ? 'Yes' : 'No', inline: true });
    fields.push({ name: 'Account Created', value: `<t:${Math.floor(created / 1000)}:R>`, inline: true });
    fields.push({ name: 'ID', value: `\`${targetId}\``, inline: true });
    const emb = {
      color: COLORS.blurple,
      title: `${nickname}'s info`,
      description: `<@${targetId}>`,
      thumbnail: avatarUrl ? { url: avatarUrl } : null,
      fields,
    };
    if (!emb.thumbnail) delete emb.thumbnail;
    return json({ type: 4, data: { flags: 64, embeds: [emb] } });
  } catch (e) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Error', 'Could not fetch user info.')] },
    });
  }
}

async function handleOwnerAnnounce(env, interaction, userId) {
  if (!isOwner(userId)) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Owner Only', 'Only the server owner can use this command.')] },
    });
  }
  const text = (interaction.data?.options?.find((o) => o.name === 'text')?.value || '').trim();
  if (!text) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Empty', 'Usage: `/announce text: "message"` — posts to <#' + INFO_CHANNEL_ID + '>.')] },
    });
  }
  const mention = /@here|@everyone/.test(text) ? text.match(/@here|@everyone/)[0] : '';
  const body = text.replace(/@here|@everyone/g, '').trim() || mention;
  try {
    const posted = await postToChannel(env, INFO_CHANNEL_ID, {
      embeds: [{ color: 0x2dd4bf, title: '📢 Announcement', description: body }],
    });
    if (mention && posted.id) {
      await patchMessage(env, INFO_CHANNEL_ID, posted.id, { content: mention }).catch(() => {});
    }
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [embed('Announced', `Posted to <#${INFO_CHANNEL_ID}>${mention ? ' with ' + mention : ''}.`, COLORS.green)],
      },
    });
  } catch (e) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Failed', 'Could not post the announcement.')] },
    });
  }
}

async function handleOwnerPoll(env, interaction, userId) {
  if (!isOwner(userId)) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Owner Only', 'Only the server owner can use this command.')] },
    });
  }
  const opts = {};
  for (const o of interaction.data?.options || []) opts[o.name] = o.value;
  const question = (opts.question || '').trim();
  const answers = [opts.first, opts.second, opts.third, opts.fourth, opts.fifth]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  if (!question || answers.length < 2) {
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [errorEmbed('Invalid Poll', 'Usage: `/poll question:"Q" first:"A" second:"B"` — up to 5 answer options.')],
      },
    });
  }
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const picked = answers.slice(0, 10);
  const list = picked.map((a, i) => `${emojis[i]} ${a}`).join('\n');
  try {
    const posted = await postToChannel(env, INFO_CHANNEL_ID, {
      embeds: [{ color: 0xfb923c, title: '🗳️ Poll', description: `**${question}**\n\n${list}` }],
    });
    if (posted.id) {
      for (let i = 0; i < picked.length; i++) {
        await addReaction(env, INFO_CHANNEL_ID, posted.id, emojis[i]).catch(() => {});
      }
    }
    return json({
      type: 4,
      data: {
        flags: 64,
        embeds: [embed('Poll Created', `Hosted in <#${INFO_CHANNEL_ID}>.`, COLORS.green)],
      },
    });
  } catch (e) {
    return json({
      type: 4,
      data: { flags: 64, embeds: [errorEmbed('Failed', 'Could not post the poll.')] },
    });
  }
}

async function callback(env, id, token, body) {
  const res = await fetch(`${API}/interactions/${id}/${token}/callback`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => '');
    throw new Error(`callback_${res.status}_${b.slice(0, 100)}`);
  }
}

async function editResponse(env, token, embedObj, gifBytes) {
  if (gifBytes) {
    const form = new FormData();
    form.append('file', new Blob([gifBytes], { type: 'image/gif' }), 'converted.gif');
    form.append('payload_json', JSON.stringify({ embeds: [embedObj] }));
    const res = await fetch(`${API}/webhooks/${env.DISCORD_CLIENT_ID}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
      body: form,
    });
    if (!res.ok) throw new Error(`edit_${res.status}`);
    return;
  }

  const res = await fetch(`${API}/webhooks/${env.DISCORD_CLIENT_ID}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds: [embedObj] }),
  });
  if (!res.ok) throw new Error(`edit_${res.status}`);
}

export const config = { runtime: 'nodejs' };