import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import UPNG from '../node_modules/upng-js/upng.js';
import * as gifenc from '../node_modules/gifenc/dist/gifenc.esm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function decodeImage(buffer, ext) {
  if (ext !== 'png') throw new Error('test only supports png: ' + ext);
  const img = UPNG.decode(buffer);
  const frame = UPNG.toRGBA8(img)[0];
  return { width: img.width, height: img.height, data: new Uint8Array(frame) };
}
function scaleDown(width, height, maxDim) {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
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
function encodeGif(data, width, height, delay = 100, loop = false) {
  const gif = gifenc.GIFEncoder();
  const palette = gifenc.quantize(data, 128);
  const index = gifenc.applyPalette(data, palette);
  gif.writeFrame(index, width, height, { palette, delay, repeat: loop ? 0 : -1 });
  gif.finish();
  return gif.bytes();
}

function bilinearSample(src, sw, sh, x, y, out, di) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(sw - 1, x0 + 1);
  const y1 = Math.min(sh - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 4; c++) {
    const top = src[(y0 * sw + x0) * 4 + c] * (1 - fx) + src[(y0 * sw + x1) * 4 + c] * fx;
    const bot = src[(y1 * sw + x0) * 4 + c] * (1 - fx) + src[(y1 * sw + x1) * 4 + c] * fx;
    out[di + c] = top * (1 - fy) + bot * fy;
  }
}

function renderZoomFrame(src, sw, sh, dw, dh, zoom, panX, panY, bright) {
  const out = new Uint8Array(dw * dh * 4);
  const cx = sw / 2;
  const cy = sh / 2;
  const halfW = sw / zoom / 2;
  const halfH = sh / zoom / 2;
  const sx0 = cx + panX * sw - halfW;
  const sy0 = cy + panY * sh - halfH;
  for (let y = 0; y < dh; y++) {
    const sy = Math.max(0, Math.min(sh - 1, sy0 + ((y + 0.5) / dh) * (halfW * 2) - 0.5));
    for (let x = 0; x < dw; x++) {
      const sx = Math.max(0, Math.min(sw - 1, sx0 + ((x + 0.5) / dw) * (halfW * 2) - 0.5));
      const di = (y * dw + x) * 4;
      bilinearSample(src, sw, sh, sx, sy, out, di);
      out[di] *= bright;
      out[di + 1] *= bright;
      out[di + 2] *= bright;
      out[di + 3] = 255;
    }
  }
  return out;
}

const ANIM_FRAMES = 14;
const ANIM_ZOOM = 0.1;
const ANIM_PAN = 0.04;
const ANIM_BRIGHT = 0.12;
const ANIM_DELAY = 100;

function buildFrames(data, sw, sh, dw, dh) {
  const frames = [];
  for (let i = 0; i < ANIM_FRAMES; i++) {
    const t = (i / (ANIM_FRAMES - 1)) * Math.PI;
    const zoom = 1 + ANIM_ZOOM * Math.sin(t);
    const panX = ANIM_PAN * Math.sin(t * 3);
    const panY = ANIM_PAN * Math.cos(t * 2);
    const bright = 1 - ANIM_BRIGHT * Math.sin(t);
    frames.push(renderZoomFrame(data, sw, sh, dw, dh, zoom, panX, panY, bright));
  }
  return frames;
}

function encodeAnimatedGif(frames, width, height) {
  const gif = gifenc.GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const palette = gifenc.quantize(frames[i], 128);
    const index = gifenc.applyPalette(frames[i], palette);
    gif.writeFrame(index, width, height, { palette, delay: ANIM_DELAY, repeat: 0 });
  }
  gif.finish();
  return gif.bytes();
}

const buf = fs.readFileSync(path.join(__dirname, '..', 'test-grad.png'));
const img = decodeImage(buf, 'png');
console.log('decoded:', img.width + 'x' + img.height);
const size = scaleDown(img.width, img.height, 360);
const rgba = resizeBilinear(img.data, img.width, img.height, size.width, size.height);
console.log('rgba bytes:', rgba.length);
const out = encodeAnimatedGif(buildFrames(rgba, size.width, size.height, size.width, size.height), size.width, size.height);
console.log('animated gif bytes:', out ? out.length : null);
if (out) console.log('header:', Buffer.from(out.slice(0, 6)).toString('ascii'));

const frames = buildFrames(rgba, size.width, size.height, size.width, size.height);
let diff = 0;
for (let i = 0; i < frames[0].length; i += 4) {
  if (Math.abs(frames[0][i] - frames[5][i]) > 8) diff++;
}
console.log('pixels changed between frame0 and frame5:', diff, 'of', frames[0].length / 4);