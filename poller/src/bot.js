import {
  downloadAttachment,
  imageToGif,
  imageExt,
  imgInfo,
  isSupportedImage,
  rasterizeForAI,
} from '../../functions/_lib/media.js';
import { readStats, writeStats } from '../../functions/_lib/rate.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const API = 'https://discord.com/api/v10';
const INVITE_URL = 'https://discord.gg/<YOUR_INVITE_CODE>';
const OUR_INVITE_CODE = '<YOUR_INVITE_CODE>';
const CLIENT_ID = '<YOUR_APPLICATION_ID>';
const INTENTS = (1 << 0) | (1 << 9) | (1 << 10) | (1 << 12) | (1 << 15);

const FALLBACK = {
  MAIN_GUILD_ID: '<YOUR_SERVER_ID>',
  INFO_CHANNEL_ID: '<YOUR_INFO_CHANNEL_ID>',
  ABUSE_CHANNEL_ID: '<YOUR_MODLOG_CHANNEL_ID>',
  OWNER_IDS: '<YOUR_DISCORD_USER_ID>',
  BAD_REACTIONS:
    '😡,🤬,🖕,💢,🗯️,☠️,💀,👿',
};

const COLORS = {
  blurple: 0x5865f2,
  green: 0x23a55a,
  red: 0xf23f43,
  gold: 0xfaa61a,
};

const GIF_LIMIT = 3;
const GIF_WINDOW = 10 * 60 * 1000;

const SCAN_EMOJI = '🎬';
const WARN_EMOJI = '⚠️';
const VERIFY_CHANNEL_NAME = 'verify';
const SPAM_LIMIT = 5;
const SPAM_WINDOW_MS = 6000;
const TIMEOUT_MS = 10 * 60 * 1000;
const MENTION_LIMIT = 5;
const ESCALATION_THRESHOLD = 3;
const AI_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const NSFW_RE = /\b(yes|explicit|nude|naked|porn|pornographic|nsfw|sexual|sexualized|sexually|erotic|intercourse|masturbat|hentai|underage)\b/i;
const IMAGE_LOG_CHANNEL = '<YOUR_MODLOG_CHANNEL_ID>';

const SCAM_PATTERNS = [
  'free nitro',
  'nitro gift',
  'nitro giveaway',
  'nitro booster',
  'steam gift',
  'free vbucks',
  'free robux',
  'free minecraft',
  'win a free',
  'get free',
  'click here',
  'claim now',
];
const SHADY_TLDS = [
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'icu', 'xyz',
  'click', 'link', 'cloud', 'discount', 'cheap', 'win',
];
const SHORTENER_HOSTS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'rb.gy',
  'cutt.ly', 'rebrand.ly', 'ow.ly', 'buff.ly', 'shorturl.at',
  'tiny.cc', 'snip.ly', 'dsc.gg', 's.id', 'u.to',
];
const DISCORD_INVITE_RE = /(?:discord\.(?:gg|me|io)\/|discord(?:app)?\.com\/invite\/)([a-zA-Z0-9]+)/gi;
const LEGACY_PREFIX_COMMANDS = new Set([
  'gif', 'imginfo', 'img', 'avatar', 'av', 'ping', 'uptime',
  'stats', 'top', 'invite', 'help', 'announce', 'info', 'poll',
]);

function embed(title, description, color = COLORS.blurple, fields = []) {
  const e = { color, title, description };
  if (fields.length) e.fields = fields;
  return e;
}

function errorEmbed(title, description) {
  return embed(title, description, COLORS.red);
}

function isShadyUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().split(':').pop();
    const parts = host.split('.');
    const tld = parts[parts.length - 1];
    if (SHADY_TLDS.includes(tld)) return true;
    if (SCAM_PATTERNS.some((p) => host.includes(p))) return true;
    return false;
  } catch {
    return false;
  }
}

function isShortenerUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return SHORTENER_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function isForeignDiscordInvite(content) {
  const matches = (content || '').match(DISCORD_INVITE_RE) || [];
  for (const m of matches) {
    const code = m.replace(/^.*\//, '').toLowerCase();
    if (code && code !== OUR_INVITE_CODE) return true;
  }
  return false;
}

export class GatewayBotV5 {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.home = env.MAIN_GUILD_ID || FALLBACK.MAIN_GUILD_ID;
    this.infoChannel = env.INFO_CHANNEL_ID || FALLBACK.INFO_CHANNEL_ID;
    this.abuseChannel = env.ABUSE_CHANNEL_ID || FALLBACK.ABUSE_CHANNEL_ID;
    this.owners = new Set(
      String(env.OWNER_IDS || FALLBACK.OWNER_IDS)
        .split(/[\s,]+/)
        .filter(Boolean)
    );
    const defaultReactions = FALLBACK.BAD_REACTIONS;
    this.badReactions = new Set(
      (env.BAD_REACTIONS || defaultReactions)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    const defaultWords = (env.BAD_WORDS || '').split(',');
    this.badWords = defaultWords
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this.ws = null;
    this.heartbeatTimer = null;
    this.seq = null;
    this.sessionId = null;
    this.connected = false;
    this.verifyChannelId = null;
    this.hbStart = 0;
    this.flushInFlight = false;
    this.mem = {
      startedAt: 0,
      gifCount: 0,
      serverCount: 0,
      ping: 0,
      lastEvent: 0,
      lastFlush: 0,
      lastServerPut: 0,
      lastPollPut: 0,
      syncBase: 0,
      announcementPosted: false,
      buckets: new Map(),
      spam: new Map(),
      userCounts: new Map(),
      violations: new Map(),
      legacyNotices: new Map(),
      notices: new Map(),
      verifiedCache: new Map(),
      scanErrLogged: new Set(),
      msgCache: new Map(),
      vThreads: new Map(),
    };
  }

  async alarm() {
    await this.flushStats();
    try {
      await this.state.storage.setAlarm(Date.now() + 60000);
    } catch (e) {
      // ignore
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      if (this.connected) {
        const guilds = await this.getGuilds();
        if (guilds.length) this.mem.serverCount = guilds.length;
      }
      return new Response(
        JSON.stringify({
          connected: this.connected,
          ws: this.ws ? this.ws.readyState : -1,
          seq: this.seq,
          lastEventAgo: this.mem.lastEvent ? Date.now() - this.mem.lastEvent : -1,
          ping: this.mem.ping,
          gifCount: this.mem.gifCount,
          serverCount: this.mem.serverCount,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      await this.flushStats();
      return new Response(JSON.stringify({ connected: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    this.connect();
    return new Response(JSON.stringify({ connected: false, starting: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (!this.env.BOT_TOKEN) return;

    const ws = new WebSocket(GATEWAY_URL);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.identify();
    });

    ws.addEventListener('message', (event) => {
      this.onMessage(event.data);
    });

    ws.addEventListener('close', (event) => {
      this.connected = false;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.ws = null;
      setTimeout(() => this.connect(), 5000);
    });

    ws.addEventListener('error', () => {
      this.connected = false;
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
    });
  }

  identify() {
    this.send({
      op: 2,
      d: {
        token: this.env.BOT_TOKEN,
        intents: INTENTS,
        properties: {
          os: 'cloudflare',
          browser: 'workers',
          device: 'convert2gif',
        },
        presence: {
          status: 'online',
          activities: [
            { name: '🎬 0 GIFs converted', type: 0 },
            { name: 'custom', type: 4, state: 'Commands: /gif', emoji: null },
          ],
          afk: false,
          since: null,
        },
      },
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  onMessage(data) {
    this.mem.lastEvent = Date.now();
    let payload;
    try {
      payload = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (typeof payload.s === 'number') this.seq = payload.s;
    switch (payload.op) {
      case 10:
        this.startHeartbeat(payload.d.heartbeat_interval);
        this.connected = true;
        break;
      case 11:
        if (this.hbStart) this.mem.ping = Date.now() - this.hbStart;
        break;
      case 0:
        this.handleDispatch(payload).catch(() => {});
        break;
    }
  }

  startHeartbeat(intervalMs) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.hbStart = Date.now();
      this.send({ op: 1, d: this.seq });
      this.updatePresence();
    }, intervalMs);
  }

  async handleDispatch(payload) {
    if (payload.t === 'READY') {
      this.sessionId = payload.d.session_id;
      this.connected = true;
      if (!this.mem.startedAt) this.mem.startedAt = Date.now();
      this.mem.serverCount = payload.d.guilds ? payload.d.guilds.length : 0;
      const prev = await readStats(this.env).catch(() => null);
      if (prev && typeof prev.gifCount === 'number') {
        this.mem.gifCount = prev.gifCount;
        this.mem.syncBase = prev.gifCount;
      }
      await this.putServerCount(this.mem.serverCount);
      await this.flushStats();
      await this.maybeAnnounceMembership();
      await this.ensureVerifyPanel();
      this.updatePresence();
    }

    if (payload.t === 'GUILD_CREATE') {
      const guilds = await this.getGuilds();
      this.mem.serverCount = guilds.length;
      await this.putServerCount(guilds.length);
      this.updatePresence();
    }

    if (payload.t === 'MESSAGE_CREATE') {
      await this.onMessageCreate(payload.d);
    }

    if (payload.t === 'MESSAGE_DELETE') {
      await this.onMessageDelete(payload.d).catch(() => {});
    }

    if (payload.t === 'MESSAGE_UPDATE') {
      await this.onMessageUpdate(payload.d).catch(() => {});
    }

    if (payload.t === 'MESSAGE_REACTION_ADD') {
      await this.onReactionAdd(payload.d);
    }
  }

  async onMessageCreate(msg) {
    if (!msg || !msg.author) return;

    if (msg.type === 6 || msg.type === 587) {
      await this.deleteMessage(msg.channel_id, msg.id).catch(() => {});
      return;
    }

    if (msg.guild_id === this.home && !msg.author.bot && !msg.webhook_id) {
      this.cacheMessage(msg);
      const joinedAt = (msg.member && msg.member.joined_at) || null;
      if (!(await this.isVerified(msg.guild_id, msg.author.id, joinedAt))) {
        await this.handleVerification(msg).catch(() => {});
        return;
      }
    }

    if (msg.channel_id === this.infoChannel && msg.guild_id === this.home) {
      this.autoPin(msg).catch(() => {});
    }

    if (msg.author.bot && !msg.webhook_id) return;

    const content = msg.content || '';
    const isHome = msg.guild_id === this.home;
    const isOwner = this.owners.has(msg.author.id);
    const isWebhook = !!msg.webhook_id;

    if (isHome && !isOwner && !isWebhook) {
      const spamResult = this.checkSpam(msg.author.id, msg.id);
      if (spamResult) {
        await this.react(msg.channel_id, msg.id, WARN_EMOJI).catch(() => {});
        await this.logActivity({
          color: 0xfaa61a,
          title: '⚡ Anti-Spam',
          user: msg.author,
          channelId: msg.channel_id,
          messageId: msg.id,
          guildId: msg.guild_id,
          detail: `${spamResult.count} messages in ${spamResult.windowMs / 1000}s — deleted + timed out.`,
        }).catch(() => {});
        for (const m of spamResult.messages) {
          await this.deleteMessage(msg.channel_id, m.id).catch(() => {});
        }
        await this.forwardViolation(msg, 'Forwarded Anti-Spam').catch(() => {});
        await this.timeoutMember(msg.guild_id, msg.author.id).catch(() => {});
        await this.notifyViolator(msg.author, '⚡ Anti-Spam', `${spamResult.count} messages in ${spamResult.windowMs / 1000}s — deleted and you were timed out.`, msg.channel_id, 'spam').catch(() => {});
        return;
      }

      if (this.isAbuseText(content)) {
        await this.handleViolation(msg, '🚨 Abuse: Message', content.slice(0, 1800), 'respect');
        return;
      }

      const mentionCount = (msg.mentions && msg.mentions.length) || 0;
      if (mentionCount > MENTION_LIMIT) {
        await this.handleViolation(msg, '🚨 Mention Storm', `${mentionCount} mentions — deleted.`, 'spam');
        return;
      }

      const urlPattern = /https?:\/\/[^\s]+/gi;
      const urls = content.match(urlPattern) || [];
      const flaggedUrl = urls.find((u) => isShadyUrl(u) || isShortenerUrl(u));
      if (flaggedUrl) {
        await this.handleViolation(msg, '🚨 Scam/Spam Link', `Flagged URL: ${flaggedUrl.slice(0, 500)}`, 'malware');
        return;
      }

      if (isForeignDiscordInvite(content)) {
        await this.handleViolation(msg, '🚨 Discord Invite', content.slice(0, 1800), 'spam');
        return;
      }

      const scamText = SCAM_PATTERNS.some(
        (p) => content.toLowerCase().includes(p)
      );
      if (scamText) {
        await this.handleViolation(msg, '🚨 Scam Text', content.slice(0, 1800), 'malware');
        return;
      }
    }

    if (content) {
      const first = content.trim().split(/\s+/)[0].toLowerCase();
      if (first[0] === '.' && LEGACY_PREFIX_COMMANDS.has(first.slice(1))) {
        await this.legacyPrefixNotice(msg).catch(() => {});
      }
    }

    if (isHome && !isWebhook && msg.attachments && msg.attachments.length) {
      for (const att of msg.attachments) {
        if (att.content_type && att.content_type.startsWith('image/')) {
          this.logImagePost(att, msg).catch(() => {});
          this.scanImageNsfw(att, msg).catch(() => {});
        }
      }
    }
  }

  async handleViolation(msg, title, detail, kind = 'respect') {
    await this.react(msg.channel_id, msg.id, WARN_EMOJI).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    await this.logActivity({
      color: 0xf23f43,
      title,
      user: msg.author,
      channelId: msg.channel_id,
      messageId: msg.id,
      guildId: msg.guild_id,
      detail,
    }).catch(() => {});
    await this.forwardViolation(msg, 'Forwarded Violation').catch(() => {});
    await this.deleteMessage(msg.channel_id, msg.id).catch(() => {});
    await this.escalate(msg.author, msg.guild_id).catch(() => {});
    await this.notifyViolator(msg.author, title, detail, msg.channel_id, kind).catch(() => {});
  }

  async escalate(user, guildId) {
    const n = (this.mem.violations.get(user.id) || 0) + 1;
    this.mem.violations.set(user.id, n);
    if (n >= ESCALATION_THRESHOLD) {
      await this.timeoutMember(guildId, user.id).catch(() => {});
      await this.logActivity({
        color: 0xf23f43,
        title: '🚨 Escalated',
        user,
        channelId: null,
        messageId: null,
        guildId,
        detail: `${n} violations in a short window — automatically timed out for 10 minutes.`,
      }).catch(() => {});
      await this.notifyViolator(user, '🚨 Escalated', `${n} violations in a short window — automatically timed out for 10 minutes.`, null, 'respect').catch(() => {});
      this.mem.violations.delete(user.id);
    }
  }

  cacheMessage(msg) {
    if (!this.mem.msgCache) this.mem.msgCache = new Map();
    const key = `${msg.channel_id}:${msg.id}`;
    this.mem.msgCache.set(key, {
      content: msg.content || '',
      authorId: msg.author.id,
      authorName: msg.author.username || String(msg.author.id),
      channelId: msg.channel_id,
      guildId: msg.guild_id || this.home,
      attachments: (msg.attachments || []).map((a) => ({
        filename: a.filename || 'image',
        url: a.url,
        contentType: a.content_type || '',
      })),
    });
    if (this.mem.msgCache.size > 4000) {
      const it = this.mem.msgCache.keys();
      while (this.mem.msgCache.size > 3500) this.mem.msgCache.delete(it.next().value);
    }
  }

  removeCached(channelId, messageId) {
    if (this.mem.msgCache) this.mem.msgCache.delete(`${channelId}:${messageId}`);
  }

  async onMessageDelete(d) {
    if (!d || (d.guild_id && d.guild_id !== this.home)) return;
    const key = `${d.channel_id}:${d.id}`;
    const cached = this.mem.msgCache.get(key);
    if (!cached) return;
    this.mem.msgCache.delete(key);
    const atts = cached.attachments.length
      ? `\n**Attachments:** ${cached.attachments.map((a) => `\`${a.filename}\``).join(', ')}`
      : '';
    await this.logActivity({
      color: COLORS.gold,
      title: '🗑️ Message Deleted',
      user: { id: cached.authorId, username: cached.authorName },
      channelId: d.channel_id,
      messageId: d.id,
      guildId: d.guild_id || this.home,
      content: cached.content || null,
      detail: cached.content ? null : `*no text in the cached copy*${atts}`,
      extra: atts,
    }).catch(() => {});
  }

  async onMessageUpdate(d) {
    if (!d || (d.guild_id && d.guild_id !== this.home)) return;
    if (!d.channel_id || !d.id || d.content === undefined) return;
    const key = `${d.channel_id}:${d.id}`;
    const cached = this.mem.msgCache.get(key);
    if (!cached) return;
    const before = cached.content || '';
    const after = d.content || '';
    if (before === after) return;
    cached.content = after;
    this.mem.msgCache.set(key, cached);
    await this.logActivity({
      color: COLORS.blurple,
      title: '✏️ Message Edited',
      user: { id: cached.authorId, username: cached.authorName },
      channelId: d.channel_id,
      messageId: d.id,
      guildId: d.guild_id || this.home,
      content: `**Before:** ${before.slice(0, 900) || '*empty*'}\n\n**After:** ${after.slice(0, 900) || '*empty*'}`,
    }).catch(() => {});
  }

  penaltyMessage(user, title, detail, channelId, kind) {
    const rules = {
      nsfw: [
        '• **Do Not Share Sexual Content of Minors** — sexual or suggestive content involving anyone under 18 is strictly forbidden and reported to Discord Trust & Safety.',
        '• **Do Not Share Sexually Explicit Content** — explicit adult content is only allowed in properly age-gated 18+ spaces; posting it in general chat violates the [Community Guidelines](https://discord.com/guidelines).',
        '• **Do Not Share Disturbing or Violent Content** — content meant to shock, disgust, or hurt people is not allowed.',
      ],
      respect: [
        '• **Do Not Spread Hate** — hateful or discriminatory speech against a person or group violates Discord\'s [Community Guidelines](https://discord.com/guidelines).',
        '• **Do Not Harass Anyone** — bullying, stalking, doxxing, or picking on people is not tolerated.',
        '• **No Threats or Glorifying Violence** — violent threats, even as a joke, are taken seriously.',
      ],
      malware: [
        '• **No Spam, Scams, or Malicious Links** — phishing, impersonation, and links that harm people or devices violate Discord\'s [Terms of Service](https://discord.com/terms) and Guidelines.',
        '• **Do Not Share Misinformation or Malware** — deceptive links and payloads are treated as abuse.',
        '• **Report Suspicious Behavior** — if you suspect a scam, report it instead of sharing it.',
      ],
      spam: [
        '• **Do Not Spam** — flooding chat, mass-mentions, or repeating the same message is against the [Guidelines](https://discord.com/guidelines).',
        '• **Respect Community Spaces** — keep chat on-topic and non-disruptive.',
        '• **No Fake Invites** — spamming invite links or deceptive invites is not allowed.',
      ],
    };
    const lines = [
      `Hey <@${user.id}> — this is **Convert2GIF's automatic moderation system**.`,
      '',
      `**What you did:** ${title}${channelId ? ` in <#${channelId}>` : ''}.`,
      detail ? `**Detail:** ${detail}` : null,
      'Your message was **removed**, **forwarded to the mod log**, and **logged** for the moderators.',
      '',
      '**Some Discord rules that apply to what you did:**',
      ...(rules[kind] || rules.respect),
      '',
      '**What happens next:** repeated violations automatically lead to timeouts, then a ban and a report to Discord Trust & Safety.',
      'If you believe this was a mistake, message the server owner to appeal.',
    ];
    return lines.filter((l) => l !== null && l !== undefined).join('\n');
  }

  async tryDM(userId, content) {
    if (!content) return true;
    try {
      const chRes = await fetch(`${API}/users/${userId}/channels`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId }),
      });
      if (!chRes.ok) return false;
      const ch = await chRes.json();
      if (!ch || !ch.id) return false;
      const putRes = await fetch(`${API}/channels/${ch.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      return putRes.ok;
    } catch (e) {
      return false;
    }
  }

  async threadPenalty(user, text) {
    if (!user || !user.id) return;
    if (!this.mem.vThreads) this.mem.vThreads = new Map();
    const key = `vthread:${user.id}`;
    const existing = this.mem.vThreads.get(key);
    if (existing) {
      const res = await fetch(`${API}/channels/${existing}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) return;
      this.mem.vThreads.delete(key);
    }
    const res = await fetch(`${API}/channels/${this.abuseChannel}/threads`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `⚠️ ${String(user.username || user.id).slice(0, 20)} — DM off`,
        type: 12,
        auto_archive_duration: 1440,
        invitable: true,
      }),
    });
    if (!res.ok) return;
    const th = await res.json();
    if (th && th.id) {
      try {
        await fetch(`${API}/channels/${th.id}/members/${user.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
        });
      } catch (e) {}
      try {
        await fetch(`${API}/channels/${th.id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
      } catch (e) {}
      this.mem.vThreads.set(key, th.id);
    }
  }

  async notifyViolator(user, title, detail, channelId, kind) {
    const text = this.penaltyMessage(user, title, detail, channelId, kind || 'respect');
    const dmOk = await this.tryDM(user.id, text).catch(() => false);
    if (!dmOk) await this.threadPenalty(user, text).catch(() => {});
  }

  async forwardViolation(msg, title) {
    if (!this.abuseChannel) return;
    const atts = msg.attachments || [];
    const pasted = (msg.content || '').trim().slice(0, 1400);
    const embObj = {
      color: 0xf23f43,
      title: `📨 ${title}`,
      description: [
        `**From:** <@${msg.author.id}> \`${msg.author.username || 'unknown'}\``,
        `**Channel:** <#${msg.channel_id}>`,
        `**Link:** [message](https://discord.com/channels/${msg.guild_id || this.home}/${msg.channel_id}/${msg.id})`,
        pasted ? `\n**Content:**\n${pasted}` : '*no text content*',
      ].join('\n'),
      footer: { text: 'Forwarded copy — original was removed and logged.' },
    };
    if (!atts.length) {
      await this.sendEmbed(this.abuseChannel, null, embObj).catch(() => {});
      return;
    }
    try {
      const first = atts[0];
      const fileResp = await fetch(first.url);
      if (!fileResp.ok) throw new Error('attachment fetch failed');
      const fileBuf = await fileResp.arrayBuffer();
      const form = new FormData();
      form.append('file', new Blob([fileBuf], { type: first.contentType || 'image/png' }), first.filename || 'attachment');
      form.append('payload_json', JSON.stringify({ embeds: [embObj] }));
      await fetch(`${API}/channels/${this.abuseChannel}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
        body: form,
      });
    } catch (e) {
      await this.sendEmbed(this.abuseChannel, null, embObj).catch(() => {});
    }
  }

  async legacyPrefixNotice(msg) {
    const last = this.mem.legacyNotices.get(msg.author.id) || 0;
    const now = Date.now();
    if (now - last < 20000) return;
    this.mem.legacyNotices.set(msg.author.id, now);
    await this.sendEmbed(
      msg.channel_id,
      msg.id,
      embed(
        'Prefix commands are gone',
        'Convert2GIF now uses **slash commands** only.\n\nTry **`/gif`** to convert an image, **`/imginfo`** for image info, or **`/help`** for the full list.',
        COLORS.gold
      )
    );
  }

  async scanNotice(channelId, messageId, userId, text) {
    const key = `notice:${userId}`;
    const last = this.mem.notices.get(key) || 0;
    const now = Date.now();
    if (now - last < 20000) return;
    this.mem.notices.set(key, now);
    await this.sendEmbed(channelId, messageId, embed('🎬 No Image', text, COLORS.gold)).catch(() => {});
  }

  async isVerified(guildId, userId, joinedAt) {
    const key = `gverify:${guildId}:${userId}`;
    const cached = this.mem.verifiedCache.get(key);
    if (cached && Date.now() - cached.t < 5 * 60 * 1000 && (!joinedAt || cached.joinedAt === joinedAt)) {
      return true;
    }
    const raw = await this.env.CONVERT_DATA.get(key).catch(() => null);
    if (!raw) return false;
    try {
      const rec = JSON.parse(raw);
      if (joinedAt && rec.joinedAt && rec.joinedAt !== joinedAt) return false;
      this.mem.verifiedCache.set(key, { t: Date.now(), joinedAt: rec.joinedAt || joinedAt || null });
      return true;
    } catch (e) {
      return false;
    }
  }

  async handleVerification(msg) {
    await this.deleteMessage(msg.channel_id, msg.id).catch(() => {});
    const key = `notice:${msg.author.id}`;
    const last = this.mem.notices.get(key) || 0;
    if (Date.now() - last < 60000) return;
    this.mem.notices.set(key, Date.now());
    await this.sendEmbed(
      msg.channel_id,
      msg.id,
      embed(
        '🔒 Verification Required',
        'You need to verify before chatting here.\n\nOpen **#verify** and press **✅ Verify Me** — then you\'ll get full access.',
        COLORS.gold
      )
    ).catch(() => {});
  }

  async ensureVerifyPanel() {
    try {
      const done = await this.env.CONVERT_DATA.get('verifyPanelDone').catch(() => null);
      if (done) return;
      const ch = await this.findVerifyChannel();
      if (!ch) return;
      const payload = {
        embeds: [
          {
            color: COLORS.blurple,
            title: '🔒 Server Verification',
            description: [
              'Welcome to **Convert2GIF**! Before you can chat in the server you must complete verification.',
              '',
              '**By pressing ✅ Verify Me you confirm that you:**',
              '',
              '1. Are **13 or older** and follow the [Discord Terms of Service](https://discord.com/terms) and [Discord Community Guidelines](https://discord.com/guidelines).',
              '2. Will follow the server rules — **no hate speech, slurs, NSFW content, spam, scams, or malicious links** (auto-blocked and logged).',
              '3. Accept the server\'s **moderation**: images are scanned for NSFW and banned words/links are removed.',
              '',
              'Until you verify, you can only see **#info** and **#verify**.',
            ].join('\n'),
            footer: { text: 'Every member — including the owner — must verify.' },
          },
        ],
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 3, label: '✅ Verify Me', custom_id: 'verify:panel' }],
          },
        ],
      };
      const res = await fetch(`${API}/channels/${ch}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const m = await res.json();
        if (m && m.id) {
          await fetch(`${API}/channels/${ch}/pins/${m.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
          }).catch(() => {});
        }
        await this.env.CONVERT_DATA.put('verifyPanelDone', '1').catch(() => {});
      }
    } catch (e) {
      // retry on next READY
    }
  }

  async findVerifyChannel() {
    if (this.verifyChannelId) return this.verifyChannelId;
    const res = await fetch(`${API}/guilds/${this.home}/channels`, {
      headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
    }).catch(() => null);
    if (res && res.ok) {
      const chs = await res.json();
      const found = chs.find((c) => c.type === 0 && c.name === VERIFY_CHANNEL_NAME);
      if (found) {
        this.verifyChannelId = found.id;
        return found.id;
      }
    }
    return null;
  }

  async onReactionAdd(ev) {
    if (!ev) return;

    const emojiObj = ev.emoji || {};
    const emojiName = String(emojiObj.name || emojiObj.id || '').trim();
    const emojiLower = emojiName.toLowerCase();
    const isCustom = !!emojiObj.id;

    if (ev.guild_id !== this.home) {
      if (emojiLower === SCAN_EMOJI) {
        await this.handleScanReaction(ev).catch(() => {});
      }
      return;
    }

    if (ev.channel_id !== this.infoChannel) return;
    if (ev.user_id === CLIENT_ID) return;

    if (this.badReactions.has(emojiLower)) {
      await this.removeReaction(ev.channel_id, ev.message_id, ev.emoji, ev.user_id).catch(() => {});
      await this.react(ev.channel_id, ev.message_id, WARN_EMOJI).catch(() => {});
      const user =
        ev.member && ev.member.user
          ? ev.member.user
          : { id: ev.user_id, username: ev.user_id };
      await this.logActivity({
        color: 0xf23f43,
        title: '🚨 Abuse: Reaction',
        user,
        channelId: ev.channel_id,
        messageId: ev.message_id,
        guildId: ev.guild_id,
        detail: `Reacted with \`${emojiLower}\``,
      });
      return;
    }

    if (isCustom && this.badWords.some((w) => emojiLower.includes(w))) {
      await this.removeReaction(ev.channel_id, ev.message_id, ev.emoji, ev.user_id).catch(() => {});
      await this.react(ev.channel_id, ev.message_id, WARN_EMOJI).catch(() => {});
      const user =
        ev.member && ev.member.user
          ? ev.member.user
          : { id: ev.user_id, username: ev.user_id };
      await this.logActivity({
        color: 0xf23f43,
        title: '🚨 Abuse: Reaction',
        user,
        channelId: ev.channel_id,
        messageId: ev.message_id,
        guildId: ev.guild_id,
        detail: `Custom emoji name contains banned term: \`${emojiLower}\``,
      });
    }
  }

  async handleScanReaction(ev) {
    const user =
      ev.member && ev.member.user
        ? ev.member.user
        : { id: ev.user_id, username: ev.user_id };
    if (!user.id) return;

    const rl = this.hit(this.rateKey(`gif:${user.id}`), GIF_LIMIT, GIF_WINDOW);
    if (rl.limited) {
      await this.sendEmbed(
        ev.channel_id,
        ev.message_id,
        errorEmbed(
          '⏱️ Rate Limited',
          `You've hit the GIF conversion limit of **${GIF_LIMIT} per 10 minutes**. Try again shortly.`
        )
      ).catch(() => {});
      return;
    }

    let targetMsg;
    try {
      const res = await fetch(
        `${API}/channels/${ev.channel_id}/messages/${ev.message_id}`,
        { headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` } }
      );
      if (!res.ok) return;
      targetMsg = await res.json();
    } catch {
      return;
    }

    const attachment = targetMsg.attachments && targetMsg.attachments[0];
    if (!attachment) {
      await this.scanNotice(ev.channel_id, ev.message_id, user.id, 'That message has **no image** to convert.');
      return;
    }

    const name = attachment.filename || String(attachment.id) || 'image';
    const ext = imageExt(name);
    if (!isSupportedImage(ext)) {
      await this.scanNotice(ev.channel_id, ev.message_id, user.id, 'That file type is **not supported** — send a **PNG, JPG, or GIF**.');
      return;
    }

    const convertMsg = await this.sendEmbed(
      ev.channel_id,
      null,
      embed(
        '🎬 Auto-Converting via 🎬 Reaction',
        `Converting \`${name}\` — requested by <@${user.id}>`,
        COLORS.gold
      )
    ).catch(() => ({}));

    try {
      const data = await downloadAttachment(attachment.url);
      const gifBytes = imageToGif(data, name, 360);
      if (!gifBytes || gifBytes.length === 0) return;

      this.mem.gifCount += 1;
      this.incUserCount(user.id);
      this.scheduleFlush();

      const kb = (gifBytes.length / 1024).toFixed(1);
      const fields = [
        { name: 'File', value: `\`${name}\``, inline: true },
        { name: 'Size', value: `\`${kb} KB\``, inline: true },
        { name: 'Converted by', value: `<@${user.id}>`, inline: true },
        { name: 'Total Converted', value: `**${this.mem.gifCount.toLocaleString()}**`, inline: true },
      ];
      const posted = await this.sendGif(
        ev.channel_id,
        convertMsg ? convertMsg.id : null,
        gifBytes,
        embed('Conversion Complete', '', COLORS.green, fields)
      );
      const gifLink =
        posted && posted.id
          ? `https://discord.com/channels/${ev.guild_id}/${ev.channel_id}/${posted.id}`
          : '';
      await this.logActivity({
        color: COLORS.green,
        title: '🎬 GIF Converted (Reaction)',
        user,
        channelId: ev.channel_id,
        messageId: ev.message_id,
        guildId: ev.guild_id,
        detail: `**File:** \`${name}\`\n**Size:** \`${kb} KB\`\n**Output:** [converted.gif](${gifLink})`,
      }).catch(() => {});
      this.updatePresence();
    } catch (e) {
      await this.sendEmbed(
        ev.channel_id,
        convertMsg ? convertMsg.id : null,
        errorEmbed('Conversion Failed', 'Could not convert that image.')
      ).catch(() => {});
    }
  }

  isAbuseText(content) {
    if (!content || !this.badWords.length) return false;
    const t = ' ' + content.toLowerCase().replace(/[^a-z0-9\s]/g, ' ') + ' ';
    return this.badWords.some((w) => {
      const re = new RegExp(`(^|\\s)${w}(\\s|$)`, 'i');
      return re.test(t);
    });
  }

  checkSpam(userId, msgId) {
    const now = Date.now();
    const bucket = this.mem.spam.get(userId) || [];
    bucket.push({ ts: now, id: msgId });
    const recent = bucket.filter((e) => now - e.ts <= SPAM_WINDOW_MS);
    this.mem.spam.set(userId, recent);
    if (recent.length >= SPAM_LIMIT) {
      this.mem.spam.delete(userId);
      return { count: recent.length, windowMs: SPAM_WINDOW_MS, messages: recent };
    }
    return null;
  }

  async logActivity(entry) {
    if (!this.abuseChannel) return;
    const ts = `<t:${Math.floor(Date.now() / 1000)}:R>`;
    const channelMention = entry.channelId ? `<#${entry.channelId}>` : 'unknown';
    const avUrl =
      entry.user && entry.user.avatar
        ? `https://cdn.discordapp.com/avatars/${entry.user.id}/${entry.user.avatar}.png?size=64`
        : '';
    const userTag = entry.user
      ? `<@${entry.user.id}> \`${entry.user.username || entry.user.id}\``
      : 'unknown';
    const messageLink =
      entry.channelId && entry.messageId
        ? `https://discord.com/channels/${entry.guildId || this.home}/${entry.channelId}/${entry.messageId}`
        : '';
    const fields = [];
    if (messageLink) fields.push({ name: 'Message', value: messageLink, inline: false });
    if (entry.content) fields.push({ name: 'Content', value: entry.content.slice(0, 1000), inline: false });
    if (entry.extra) fields.push({ name: 'Attachments', value: entry.extra.slice(0, 500), inline: false });
    if (entry.detail) fields.push({ name: 'Detail', value: entry.detail.slice(0, 1000), inline: false });
    await this.sendEmbed(
      this.abuseChannel,
      null,
      {
        color: entry.color || 0xf23f43,
        title: entry.title || 'Activity',
        description: `**User:** ${userTag}\n**Channel:** ${channelMention}`,
        ...(avUrl ? { author: { name: entry.user.username || 'user', icon_url: avUrl } } : {}),
        fields,
        footer: { text: `Logged ${ts} — Convert2GIF` },
      }
    ).catch(() => {});
  }

  async logImagePost(attachment, msg) {
    if (!IMAGE_LOG_CHANNEL) return;
    await this.sendEmbed(
      IMAGE_LOG_CHANNEL,
      null,
      {
        color: 0x5865f2,
        title: '📸 Image Posted',
        description: [
          `**User:** <@${msg.author.id}>`,
          `**Channel:** <#${msg.channel_id}>`,
          `**File:** \`${attachment.filename || 'image'}\``,
          `**Link:** [message](https://discord.com/channels/${msg.guild_id}/${msg.channel_id}/${msg.id})`,
        ].join('\n'),
        footer: { text: `<t:${Math.floor(Date.now() / 1000)}:R>` },
      }
    ).catch(() => {});
  }

  async scanImageNsfw(attachment, msg) {
    try {
      if (!this.env.AI) return;
      const resp = await fetch(attachment.url);
      if (!resp.ok) return;
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const name = attachment.filename || 'image';

      let aiBytes;
      try {
        const raster = rasterizeForAI(bytes, name);
        if (!raster) return;
        aiBytes = raster.png;
      } catch (e) {
        if (bytes.byteLength > 768 * 1024) {
          await this.logScanError(msg, e).catch(() => {});
          return;
        }
        aiBytes = bytes;
      }

      let bin = '';
      for (let i = 0; i < aiBytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, aiBytes.subarray(i, i + 0x8000));
      }
      const dataUri = `data:image/png;base64,${btoa(bin)}`;

      const result = await this.env.AI.run(AI_MODEL, {
        prompt:
          'Is this image sexually explicit, NSFW, pornographic, or depicting nudity? Reply with only YES or NO.',
        image: dataUri,
      });

      const out = (result && result.description || '').toLowerCase();
      const isNsfw = NSFW_RE.test(out);

      if (isNsfw) {
        await this.react(msg.channel_id, msg.id, WARN_EMOJI).catch(() => {});
        await this.logActivity({
          color: 0xf23f43,
          title: '🚨 NSFW Image Detected',
          user: msg.author,
          channelId: msg.channel_id,
          messageId: msg.id,
          guildId: msg.guild_id,
          detail: `**File:** \`${name}\`\n**AI:** ${result.description.slice(0, 400)}`,
        }).catch(() => {});
        await this.forwardViolation(msg, 'Forwarded NSFW Candidate').catch(() => {});
        await this.deleteMessage(msg.channel_id, msg.id).catch(() => {});
        await this.notifyViolator(msg.author, '🚨 NSFW Image', `An image you posted (\`${name}\`) was detected as sexually explicit or NSFW by AI moderation and removed.`, msg.channel_id, 'nsfw').catch(() => {});
      }
    } catch (e) {
      await this.logScanError(msg, e).catch(() => {});
    }
  }

  async logScanError(msg, err) {
    const key = `scanerr:${Math.floor(Date.now() / 60000)}`;
    if (this.mem.scanErrLogged.has(key)) return;
    this.mem.scanErrLogged.add(key);
    await this.logActivity({
      color: 0xfaa61a,
      title: '⚠️ NSFW Scan Issue',
      user: msg.author,
      channelId: msg.channel_id,
      messageId: msg.id,
      guildId: msg.guild_id,
      detail: `**File:** \`${(msg.attachments && msg.attachments[0] && msg.attachments[0].filename) || 'unknown'}\`\n**Error:** ${String(err && err.message || err).slice(0, 300)}`,
    }).catch(() => {});
  }

  async maybeAnnounceMembership() {
    if (this.mem.announcementPosted) return;
    try {
      const flag = await this.env.CONVERT_DATA.get('membershipAnnounced').catch(() => null);
      if (flag) {
        this.mem.announcementPosted = true;
        return;
      }
      const payload = {
        content: '@everyone',
        embeds: [
          embed(
            '📋 Convert2GIF — Membership Access Rules',
            '**TO USE THIS BOT YOU MUST BE A MEMBER OF THE CONVERT2GIF SERVER.**',
            COLORS.blurple,
            [
              { name: '🟢 How access works', value: 'The bot works **anywhere** (any server or DM), but every command requires you to be a member of the **Convert2GIF** server.', inline: false },
              { name: '🚪 Leaving = revoked', value: 'If you **leave** the server, your access is **revoked** until you **rejoin**.', inline: false },
              { name: '🔗 Join here', value: `**${INVITE_URL}**`, inline: false },
              { name: '🎬 What it does', value: 'Turns **images** (PNG, JPG, GIF) into real **static GIF files**. Attach, reply, pass a URL, or **react with 🎬** to auto-convert.', inline: false },
              { name: '📜 Commands', value: 'All commands are **slash commands** — `/gif`, `/imginfo`, `/avatar`, `/ping`, `/uptime`, `/stats`, `/top`, `/top`.', inline: false },
              { name: '📸 Image logging', value: 'Every image posted in the server is logged here for moderation records.', inline: false },
              { name: '🛡️ Moderation', value: 'Banned words, reactions, scam links, spam links, Discord invite links, mention-spam, NSFW images, and spam are removed and logged. ⚠️ marks violations.', inline: false },
              { name: '⏱️ Limits', value: '**3** GIF conversions per 10 minutes per user. Repeat offenders are automatically timed out.', inline: false },
              { name: '👑 Owner tools', value: '`/announce <text>` posts to the info channel. `/poll` starts a reaction poll.', inline: false },
              { name: '🏠 Hosted by', value: 'https://convert2gif.pages.dev/', inline: false },
            ]
          ),
        ],
      };
      const res = await fetch(`${API}/channels/${this.infoChannel}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await this.env.CONVERT_DATA.put('membershipAnnounced', '1').catch(() => {});
      }
      this.mem.announcementPosted = true;
    } catch (e) {
      // try again on the next READY
    }
  }

  async autoPin(msg) {
    const put = await fetch(`${API}/channels/${msg.channel_id}/pins/${msg.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
    });
    if (!put.ok) return;
    const pins = await fetch(`${API}/channels/${msg.channel_id}/pins`, {
      headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
    }).catch(() => null);
    if (pins && pins.ok) {
      const list = await pins.json();
      if (list.length > 10) {
        const target = [...list].sort((a, b) => (a.pinned_at > b.pinned_at ? 1 : -1))[0];
        if (target) {
          await fetch(`${API}/channels/${msg.channel_id}/pins/${target.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
          }).catch(() => {});
        }
      }
    }
  }

  async react(channelId, messageId, emoji) {
    await fetch(
      `${API}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      {
        method: 'PUT',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
      }
    );
  }

  async removeReaction(channelId, messageId, emoji, userId) {
    const name = emoji.id
      ? `${emoji.name}:${emoji.id}`
      : encodeURIComponent(emoji.name || '');
    await fetch(
      `${API}/channels/${channelId}/messages/${messageId}/reactions/${name}/${userId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
      }
    );
  }

  async deleteMessage(channelId, messageId) {
    this.removeCached(channelId, messageId);
    const res = await fetch(`${API}/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
    });
    if (!res.ok) throw new Error(`delete_${res.status}`);
  }

  async timeoutMember(guildId, userId) {
    const until = new Date(Date.now() + TIMEOUT_MS).toISOString();
    await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${this.env.BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ communication_disabled_until: until }),
    });
  }

  async getGuilds() {
    try {
      const res = await fetch(`${API}/users/@me/guilds`, {
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
      });
      if (res.ok) return await res.json();
    } catch (e) {
      // ignore
    }
    return [];
  }

  updatePresence() {
    this.send({
      op: 3,
      d: {
        since: null,
        activities: [
          { name: `🎬 ${this.mem.gifCount.toLocaleString()} GIFs converted`, type: 0 },
          { name: 'custom', type: 4, state: 'Commands: /gif', emoji: null },
        ],
        status: 'online',
        afk: false,
      },
    });
  }

  rateKey(key) {
    const now = Date.now();
    return { key, window: this.currentWindow(key, now) };
  }

  currentWindow(key, now) {
    if (key.indexOf('gif:') === 0) return Math.floor(now / GIF_WINDOW);
    return Math.floor(now / GIF_WINDOW);
  }

  hit(rk, limit, windowMs) {
    const counter = this.mem.buckets.get(rk.key);
    const now = Date.now();
    if (!counter || counter.window !== rk.window) {
      this.mem.buckets.set(rk.key, { window: rk.window, count: 1 });
      if (this.mem.buckets.size > 250) this.pruneBuckets();
      return { limited: false, remaining: limit - 1 };
    }
    if (counter.count >= limit) return { limited: true, remaining: 0 };
    counter.count += 1;
    return { limited: false, remaining: limit - counter.count };
  }

  pruneBuckets() {
    const now = Date.now();
    const gifWin = Math.floor(now / GIF_WINDOW);
    for (const [key, b] of this.mem.buckets) {
      if (b.window !== gifWin) this.mem.buckets.delete(key);
    }
  }

  incUserCount(userId) {
    const c = this.mem.userCounts.get(userId) || 0;
    this.mem.userCounts.set(userId, c + 1);
  }

  async getUserCounts() {
    try {
      const raw = await this.env.CONVERT_DATA.get('userCounts');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async flushUserCounts() {
    if (this.mem.userCounts.size === 0) return;
    try {
      const current = await this.getUserCounts();
      for (const [uid, n] of this.mem.userCounts) {
        current[uid] = (current[uid] || 0) + n;
      }
      await this.env.CONVERT_DATA.put('userCounts', JSON.stringify(current)).catch(() => {});
      this.mem.userCounts.clear();
    } catch {
      // best effort
    }
  }

  scheduleFlush() {
    if (this.flushInFlight) return;
    this.mem.lastFlush = 0;
    this.flushStats();
  }

  async flushStats() {
    if (this.flushInFlight) return;
    this.flushInFlight = true;
    try {
      const delta = this.mem.gifCount - this.mem.syncBase;
      const now = Date.now();
      if (Date.now() - this.mem.lastFlush >= 30000 || delta >= 5 || this.mem.gifCount !== this.mem.syncBase) {
        const stats = (await readStats(this.env).catch(() => null)) || {
          gifCount: 0,
          serverCount: 0,
          startedAt: Date.now(),
        };
        stats.gifCount = (stats.gifCount || 0) + delta;
        stats.serverCount = this.mem.serverCount || stats.serverCount || 0;
        stats.lastPoll = now;
        if (!stats.startedAt) stats.startedAt = this.mem.startedAt || now;
        await writeStats(this.env, stats).catch(() => {});
        await this.flushUserCounts();
        await this.putPollTime(now);
        await this.putServerCount(stats.serverCount);
        this.mem.syncBase = this.mem.gifCount;
        this.mem.lastFlush = now;
      }
    } catch (e) {
      // best effort
    } finally {
      this.flushInFlight = false;
    }
  }

  async putPollTime(now) {
    if (now - this.mem.lastPollPut < 60000) return;
    this.mem.lastPollPut = now;
    await this.env.CONVERT_DATA.put('lastPoll', String(now)).catch(() => {});
  }

  async putServerCount(count) {
    if (count === this.mem.lastServerPut) return;
    this.mem.lastServerPut = count;
    await this.env.CONVERT_DATA.put('serverCount', String(count)).catch(() => {});
  }

  async sendEmbed(channelId, replyTo, embedObj) {
    const payload = { embeds: [embedObj] };
    if (replyTo) {
      payload.message_reference = { message_id: replyTo, channel_id: channelId };
    }
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.env.BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.status !== 429) {
        return res.json().catch(() => ({}));
      }
      const body = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.min((body.retry_after || 5) * 1000, 4000)));
    }
    return null;
  }

  async sendGif(channelId, replyTo, gifBytes, embedObj) {
    const form = new FormData();
    form.append('file', new Blob([gifBytes], { type: 'image/gif' }), 'converted.gif');
    const payload = {
      embeds: embedObj ? [embedObj] : [],
    };
    if (replyTo) {
      payload.message_reference = { message_id: replyTo, channel_id: channelId };
    }
    form.append('payload_json', JSON.stringify(payload));
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${this.env.BOT_TOKEN}` },
        body: form,
      });
      if (res.status !== 429) return res.json().catch(() => ({}));
      const body = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.min((body.retry_after || 5) * 1000, 4000)));
    }
    return null;
  }
}