import UPNG from 'upng-js';
import jpeg from 'jpeg-js';
import gifencPkg from 'gifenc';
import omggifPkg from 'omggif';

const { GIFEncoder, quantize, applyPalette } = gifencPkg;
const { GifReader } = omggifPkg;

const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif'];
const UNSUPPORTED_TYPES = ['webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'];

export function imageExt(filename) {
  const dot = (filename || '').lastIndexOf('.');
  if (dot === -1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function isSupportedImage(ext) {
  return IMAGE_TYPES.includes(ext);
}

export function isUnsupported(ext) {
  return UNSUPPORTED_TYPES.includes(ext);
}

function toBuffer(uint8) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(uint8)) return uint8;
  if (uint8 instanceof Uint8Array) {
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  }
  return uint8;
}

function decodeImage(buffer, ext) {
  if (ext === 'png') {
    const img = UPNG.decode(toBuffer(buffer));
    const frame = UPNG.toRGBA8(img)[0];
    return { width: img.width, height: img.height, data: new Uint8Array(frame) };
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    const out = jpeg.decode(toBuffer(buffer), { useTArray: true, formatAsRGBA: true });
    return { width: out.width, height: out.height, data: new Uint8Array(out.data) };
  }
  if (ext === 'gif') {
    return null;
  }
  throw new Error('unsupported');
}

export function decodeGifFrame(buffer, frameIndex = 0) {
  const reader = new GifReader(toBuffer(buffer));
  const frames = reader.numFrames();
  if (!frames) return null;
  const idx = Math.max(0, Math.min(frameIndex, frames - 1));
  const rgba = new Uint8Array(reader.width * reader.height * 4);
  reader.decodeAndBlitFrameRGBA(idx, rgba);
  return { width: reader.width, height: reader.height, data: rgba };
}

export function rasterizeForAI(buffer, filename, maxDim = 512) {
  const ext = imageExt(filename);
  let img;
  if (ext === 'gif') {
    img = decodeGifFrame(buffer, 0);
  } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    img = decodeImage(buffer, ext);
  } else {
    return null;
  }
  if (!img) return null;
  const size = scaleDown(img.width, img.height, maxDim);
  const rgba =
    size.width === img.width && size.height === img.height
      ? img.data
      : resizeBilinear(img.data, img.width, img.height, size.width, size.height);
  const pngBuf = UPNG.encode([rgba], size.width, size.height);
  return { width: size.width, height: size.height, png: new Uint8Array(pngBuf) };
}

function scaleDown(width, height, maxDim) {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function bilinearSample(src, sw, sh, x, y, out, di) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(sw - 1, x0 + 1);
  const y1 = Math.min(sh - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * sw + x0) * 4;
  const i10 = (y0 * sw + x1) * 4;
  const i01 = (y1 * sw + x0) * 4;
  const i11 = (y1 * sw + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
    const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
    out[di + c] = top * (1 - fy) + bot * fy;
  }
}

function resizeBilinear(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / dh - 0.5));
    for (let x = 0; x < dw; x++) {
      const sx = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / dw - 0.5));
      bilinearSample(src, sw, sh, sx, sy, out, (y * dw + x) * 4);
    }
  }
  return out;
}

export async function downloadAttachment(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download_failed');
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export function encodeGif({ width, height, data, delay = 100, loop = false }) {
  const gif = GIFEncoder();
  const palette = quantize(data, 128);
  const index = applyPalette(data, palette);
  gif.writeFrame(index, width, height, {
    palette,
    delay,
    repeat: loop ? 0 : -1,
  });
  gif.finish();
  return gif.bytes();
}

export function encodeAnimatedGif(frames, width, height, delay = 100) {
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const palette = quantize(frames[i], 128);
    const index = applyPalette(frames[i], palette);
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: 0,
    });
  }
  gif.finish();
  return gif.bytes();
}

export function imageToGif(buffer, filename, maxDim = 360) {
  const ext = imageExt(filename);
  if (ext === 'gif') {
    return new Uint8Array(buffer);
  }
  const img = decodeImage(buffer, ext);
  if (img === null) return null;

  const size = scaleDown(img.width, img.height, maxDim);
  const rgba =
    size.width === img.width && size.height === img.height
      ? img.data
      : resizeBilinear(img.data, img.width, img.height, size.width, size.height);

  return encodeGif({ width: size.width, height: size.height, data: rgba });
}

export function imgInfo(buffer, filename) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
  const ext = imageExt(filename);
  const typeLabel = (ext || 'bin').toUpperCase();
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
    const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
    return { type: 'PNG', width: w, height: h };
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && (b[3] === 0x38)) {
    const w = b[6] | (b[7] << 8);
    const h = b[8] | (b[9] << 8);
    const scan = b[10] & 0x7f;
    let animated = false;
    let i = 13 + (scan ? 3 * (1 << ((scan & 7) + 1)) : 0);
    while (i < b.length) {
      const block = b[i];
      if (block === 0x21 && b[i + 1] === 0xf9) { animated = true; break; }
      if (block === 0x3b || block === 0x2c) break;
      i++;
    }
    return { type: 'GIF', width: w, height: h, animated };
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 3) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        const h = (b[i + 5] << 8) | b[i + 6];
        const w = (b[i + 7] << 8) | b[i + 8];
        return { type: 'JPEG', width: w, height: h };
      }
      i += 2 + len;
    }
    return { type: 'JPEG', width: 0, height: 0 };
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { type: 'WEBP', width: 0, height: 0 };
  }
  return { type: typeLabel, width: 0, height: 0 };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}