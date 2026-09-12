import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets');

const BOT_TOKEN = process.env.BOT_TOKEN;
const API = 'https://discord.com/api/v10';

if (!BOT_TOKEN) {
  console.error('Set BOT_TOKEN env var and run again.');
  process.exit(1);
}

const FONT5X7 = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  C: ['01110','10001','10000','10000','10000','10001','01110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01110'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11111','00010','00100','00010','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '/': ['00001','00010','00100','01000','10000','00000','00000'],
  ':': ['00000','00110','00110','00000','00110','00110','00000'],
};

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = table((c ^ buf[i]) & 0xff) ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
const table = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (i) => t[i];
})();

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function makeCanvas(w, h) {
  return {
    w,
    h,
    data: Buffer.alloc(w * h * 4),
    px(x, y, [r, g, b, a = 255]) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const o = (y * this.w + x) * 4;
      if (a === 255) {
        this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255;
      } else {
        const da = this.data[o + 3] / 255;
        const na = a / 255;
        const outA = na + da * (1 - na);
        if (outA === 0) return;
        this.data[o] = Math.round((r * na + this.data[o] * da * (1 - na)) / outA);
        this.data[o + 1] = Math.round((g * na + this.data[o + 1] * da * (1 - na)) / outA);
        this.data[o + 2] = Math.round((b * na + this.data[o + 2] * da * (1 - na)) / outA);
        this.data[o + 3] = Math.round(outA * 255);
      }
    },
    fill(c) {
      for (let i = 0; i < this.data.length; i += 4) {
        this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3] ?? 255;
      }
    },
    vGrad(c1, c2) {
      for (let y = 0; y < this.h; y++) {
        const t = y / (this.h - 1);
        const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
        const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
        const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
        for (let x = 0; x < this.w; x++) {
          const o = (y * this.w + x) * 4;
          this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255;
        }
      }
    },
    circle(cx, cy, r, color, fill = false) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (fill ? d <= r : Math.abs(d - r) <= 1.5) this.px(Math.round(x), Math.round(y), color);
        }
      }
    },
    roundRect(x, y, w, h, rad, color, fill = true) {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const cx = Math.max(x + rad, Math.min(px, x + w - rad));
          const cy = Math.max(y + rad, Math.min(py, y + h - rad));
          const dx = px - cx;
          const dy = py - cy;
          if (dx * dx + dy * dy > rad * rad) continue;
          if (fill) this.px(px, py, color);
        }
      }
    },
    string(text, x, y, color, scale = 1, spacing = 1) {
      let cx = x;
      for (const ch of text.toUpperCase()) {
        const glyph = FONT5X7[ch] || FONT5X7[' '];
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            if (glyph[row][col] === '1') {
              for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                  this.px(cx + col * scale + sx, y + row * scale + sy, color);
                }
              }
            }
          }
        }
        cx += 6 * scale + spacing;
      }
      return cx - spacing - x;
    },
  };
}

function blurRadius(canvas, radius) {
  const { w, h, data } = canvas;
  const out = Buffer.from(data);
  const k = 2 * radius + 1;
  const horiz = Buffer.alloc(w * 4);
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let x = 0; x < k; x++) sum += data[(y * w + Math.min(x, w - 1)) * 4 + c];
      for (let x = 0; x < w; x++) {
        horiz[x * 4 + c] = Math.round(sum / k);
        const add = data[(y * w + Math.min(x + radius + 1, w - 1)) * 4 + c];
        const rem = data[(y * w + Math.max(x - radius, 0)) * 4 + c];
        sum += add - rem;
      }
    }
    horiz.copy(out, y * w * 4, 0, w * 4);
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let y = 0; y < k; y++) sum += out[(Math.min(y, h - 1) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        const o = (y * w + x) * 4 + c;
        out[o] = Math.round(sum / k);
        const add = out[(Math.min(y + radius + 1, h - 1) * w + x) * 4 + c];
        const rem = out[(Math.max(y - radius, 0) * w + x) * 4 + c];
        sum += add - rem;
      }
    }
  }
  canvas.data = out;
}

function makeAvatar(size = 1024) {
  const c = makeCanvas(size, size);
  c.fill([0, 0, 0, 0]);
  // gradient background (visible inside rounded corners)
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(88 + (35 - 88) * t);
    const g = Math.round(101 + (39 - 101) * t);
    const b = Math.round(242 + (42 - 242) * t);
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      c.data[o] = r; c.data[o + 1] = g; c.data[o + 2] = b; c.data[o + 3] = 255;
    }
  }
  // rounded-corner mask (Discord avatars shown as circles but we use rounded square)
  const rad = size * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const topLeft = x < rad && y < rad;
      const topRight = x > size - rad && y < rad;
      const botLeft = x < rad && y > size - rad;
      const botRight = x > size - rad && y > size - rad;
      let corner = null;
      if (topLeft) corner = [rad, rad];
      else if (topRight) corner = [size - rad, rad];
      else if (botLeft) corner = [rad, size - rad];
      else if (botRight) corner = [size - rad, size - rad];
      if (corner) {
        const dx = x - corner[0];
        const dy = y - corner[1];
        if (dx * dx + dy * dy > rad * rad) c.data[(y * size + x) * 4 + 3] = 0;
      }
    }
  }

  // glow orbs
  c.circle(size * 0.78, size * 0.2, size * 0.32, [255, 255, 255, 26], true);
  c.circle(size * 0.15, size * 0.9, size * 0.4, [0, 0, 0, 30], true);

  // big white play triangle in a rounded square
  const box = size * 0.56;
  const bx = size * 0.22;
  const by = size * 0.34;
  c.roundRect(bx, by, box, box, box * 0.22, [255, 255, 255, 235], true);
  // play glyph
  const tx = bx + box * 0.36;
  const ty = by + box * 0.22;
  const tw = box * 0.3;
  const th = box * 0.56;
  for (let y = 0; y < th; y++) {
    const t = y / th;
    const inset = Math.round((tw / 2) * t);
    for (let x = inset; x < tw; x++) c.px(Math.round(tx + x), Math.round(ty + y), [88, 101, 242, 255]);
  }

  // "GIF" text pill below with "Convert to GIF" 
  const pillY = size * 0.62;
  const pillH = size * 0.12;
  c.roundRect(size * 0.2, pillY, size * 0.6, pillH, pillH / 2, [0, 0, 0, 90], true);
  const label = 'CONVERT2GIF';
  const textScale = Math.max(1, Math.floor(size / 1024) * 2) * 2;
  const spacing = size * 0.012;
  const textW = textScale * 6 * label.length + spacing * (label.length - 1);
  const textX = (size - textW) / 2;
  const textY = pillY + pillH / 2 - (7 * textScale) / 2;
  c.string(label, textX, textY, [255, 255, 255, 255], textScale, spacing);

  return encodePNG(size, size, c.data);
}

function makeBanner(w = 1500, h = 500) {
  const c = makeCanvas(w, h);
  c.fill([0, 0, 0, 0]);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const r = Math.round(24 + (15 - 24) * t);
    const g = Math.round(28 + (17 - 28) * t);
    const b = Math.round(36 + (23 - 36) * t);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      c.data[o] = r; c.data[o + 1] = g; c.data[o + 2] = b; c.data[o + 3] = 255;
    }
  }
  // left accent glow
  c.circle(w * 0.18, h * 0.5, w * 0.28, [88, 101, 242, 70], true);
  blurRadius(c, 60);
  // right glow
  c.circle(w * 0.85, h * 0.3, w * 0.2, [35, 165, 90, 50], true);
  blurRadius(c, 60);

  // film frame strip at bottom
  const stripY = h * 0.7;
  const striptH = h * 0.1;
  c.roundRect(w * 0.08, stripY + striptH * 0.25, w * 0.28, striptH, 8, [255, 255, 255, 30], true);
  // sprocket holes
  for (let i = 0; i < 1; i++) {
    for (let j = 0; j < 8; j++) {
      c.px(w * 0.1 + j * w * 0.034, stripY + striptH * 0.4, [255, 255, 255, 0]);
    }
  }
  // 3 mini frames
  const fw = w * 0.05;
  const fh = h * 0.1;
  for (let i = 0; i < 5; i++) {
    const fx = w * 0.08 + i * (fw + w * 0.015);
    c.roundRect(fx, stripY + striptH * 0.22, fw, fh, 4, [255, 255, 255, 45], true);
  }

  // "CONVERT 2 GIF"
  const title = 'CONVERT2GIF';
  const scale = Math.max(1, Math.round(w / 1500) * 6);
  const spacing = 8;
  const tw = scale * 6 * title.length + spacing * (title.length - 1);
  const tx = (w - tw) / 2;
  const ty = h * 0.2;
  c.string(title, tx, ty, [255, 255, 255, 255], scale, spacing);

  // subtitle
  const sub = 'TURN IMAGES + VIDEOS INTO GIFS';
  const sscale = Math.max(1, Math.round(w / 1500) * 2);
  const sw = sscale * 6 * sub.length;
  c.string(sub, (w - sw) / 2, ty + scale * 7 * 1.4, [255, 255, 255, 200], sscale, 3);

  return encodePNG(w, h, c.data);
}

function makeAppIcon(size = 512) {
  return makeAvatar(size);
}

function makeCover(w = 600, h = 240) {
  const c = makeCanvas(w, h);
  c.fill([15, 17, 23, 255]);
  c.circle(w * 0.5, h * 0.5, w * 0.16, [30, 34, 62, 255], true);
  blurRadius(c, 30);
  const title = 'CONVERT2GIF';
  const scale = 3;
  const tw = scale * 6 * title.length + 6 * (title.length - 1);
  c.string(title, (w - tw) / 2, h * 0.3, [255, 255, 255, 255], scale, 6);
  c.string('FREE  ·  FAST  ·  FUN', (w - 6 * 6 * 17 - 6 * 17) / 2, h * 0.62, [88, 101, 242, 255], 1, 6);
  return encodePNG(w, h, c.data);
}

async function patchBot(field, value) {
  const res = await fetch(`${API}/users/@me`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`bot.${field}: ${res.ok ? 'OK' : 'FAIL ' + (body.message || res.status)}`);
  return res.ok;
}

async function patchApp(field, value) {
  const res = await fetch(`${API}/applications/@me`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`app.${field}: ${res.ok ? 'OK' : 'FAIL ' + (body.message || res.status)}`);
  return res.ok;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const avatar = makeAvatar(1024);
  const banner = makeBanner(1500, 500);
  const appIcon = makeAppIcon(512);
  const cover = makeCover(600, 240);

  fs.writeFileSync(path.join(OUT, 'avatar.png'), avatar);
  fs.writeFileSync(path.join(OUT, 'banner.png'), banner);
  fs.writeFileSync(path.join(OUT, 'app-icon.png'), appIcon);
  fs.writeFileSync(path.join(OUT, 'store-cover.png'), cover);
  console.log('Generated assets/avatar.png, banner.png, app-icon.png, store-cover.png');

  const toData = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

  await patchBot('avatar', toData(avatar));
  await patchBot('banner', toData(banner));
  await patchApp('icon', toData(appIcon));
  await patchApp('cover_image', toData(cover));
  await patchApp('description', 'Turn images, videos, and GIFs into animated GIFs. Commands: /gif, /help, /uptime, /stats. Fast, free, no watermark.');

  console.log("bio (About Me): Discord Developer Portal -> App Settings -> General. Not settable via API.");
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});