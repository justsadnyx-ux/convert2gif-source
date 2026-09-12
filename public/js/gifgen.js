/* Convert2GIF browser GIF encoder - static + streaming animated, no dependencies. */
(function (global) {
  'use strict';

  function buildPalette(data, maxColors) {
    var hist = new Map();
    var n = data.length >> 2;
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      var key = ((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3);
      var e = hist.get(key);
      if (e) {
        e.count++;
        e.rs += data[o];
        e.gs += data[o + 1];
        e.bs += data[o + 2];
      } else {
        hist.set(key, { count: 1, rs: data[o], gs: data[o + 1], bs: data[o + 2] });
      }
    }

    var entries = Array.from(hist.values()).map(function (e) {
      return { count: e.count, r: Math.round(e.rs / e.count), g: Math.round(e.gs / e.count), b: Math.round(e.bs / e.count) };
    });

    if (entries.length <= maxColors) {
      return entries.map(function (e) { return [e.r, e.g, e.b]; });
    }

    function ranges(list) {
      var rmin = 255, gmin = 255, bmin = 255, rmax = 0, gmax = 0, bmax = 0;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.r < rmin) rmin = e.r; if (e.r > rmax) rmax = e.r;
        if (e.g < gmin) gmin = e.g; if (e.g > gmax) gmax = e.g;
        if (e.b < bmin) bmin = e.b; if (e.b > bmax) bmax = e.b;
      }
      var rr = rmax - rmin, gr = gmax - gmin, br = bmax - bmin;
      var ch = rr >= gr && rr >= br ? 0 : (gr >= br ? 1 : 2);
      var score = ch === 0 ? rr : (ch === 1 ? gr : br);
      return { score: score, ch: ch };
    }

    var boxes = [entries];
    while (boxes.length < maxColors) {
      var bi = -1, best = -1;
      for (var i = 0; i < boxes.length; i++) {
        var r = ranges(boxes[i]);
        if (r.score > best) { best = r.score; bi = i; }
      }
      if (bi < 0 || best <= 0) break;
      var bx = boxes[bi];
      var ch = ranges(bx).ch;
      bx.sort(function (a, b) { return ch === 0 ? a.r - b.r : ch === 1 ? a.g - b.g : a.b - b.b; });
      var mid = bx.length >> 1;
      boxes[bi] = bx.slice(0, mid);
      boxes.push(bx.slice(mid));
    }

    return boxes.map(function (b) {
      var r = 0, g = 0, bl = 0, c = 0;
      for (var j = 0; j < b.length; j++) { r += b[j].r * b[j].count; g += b[j].g * b[j].count; bl += b[j].b * b[j].count; c += b[j].count; }
      c = c || 1;
      return [Math.round(r / c), Math.round(g / c), Math.round(bl / c)];
    });
  }

  function nearestLut(palette) {
    var lut = new Uint8Array(32768);
    for (var key = 0; key < 32768; key++) {
      var r = (key >> 10 & 31) << 3 | 4;
      var g = (key >> 5 & 31) << 3 | 4;
      var b = (key & 31) << 3 | 4;
      var best = 0, bd = Infinity;
      for (var p = 0; p < palette.length; p++) {
        var dr = r - palette[p][0], dg = g - palette[p][1], db = b - palette[p][2];
        var d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = p; }
      }
      lut[key] = best;
    }
    return lut;
  }

  function toIndexed(data, palette, lut) {
    var n = data.length >> 2;
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      out[i] = lut[((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3)];
    }
    return out;
  }

  function lzwEncode(indices, minCodeSize) {
    var clear = 1 << minCodeSize;
    var eoi = clear + 1;
    var dictSize = clear + 2;
    var codeLen = minCodeSize + 1;
    var table = new Int32Array(4096);
    var used = new Uint8Array(4096);
    var keys = new Int32Array(4096);

    var acc = 0, nbits = 0, bytes = [];

    function emit(code, len) {
      acc |= code << nbits;
      nbits += len;
      while (nbits >= 8) {
        bytes.push(acc & 0xff);
        acc >>>= 8;
        nbits -= 8;
      }
    }

    emit(clear, codeLen);

    var prefix = indices[0];
    for (var i = 1; i < indices.length; i++) {
      var k = indices[i];
      var key = (prefix << 8) | k;
      var slot = ((key ^ (key >>> 12)) & 2047) * 2;
      var found = -1;
      while (used[slot]) {
        if (keys[slot] === key) { found = table[slot]; break; }
        slot = (slot + 1) & 4095;
      }
      if (found >= 0) {
        prefix = found;
      } else {
        emit(prefix, codeLen);
        if (dictSize < 4096) {
          table[slot] = dictSize;
          keys[slot] = key;
          used[slot] = 1;
          dictSize++;
          if (dictSize === (1 << codeLen) && codeLen < 12) codeLen++;
        } else {
          emit(clear, codeLen);
          table.fill(0);
          used.fill(0);
          keys.fill(0);
          dictSize = clear + 2;
          codeLen = minCodeSize + 1;
        }
        prefix = k;
      }
    }
    emit(prefix, codeLen);
    emit(eoi, codeLen);
    if (nbits > 0) bytes.push(acc & 0xff);
    return bytes;
  }

  function chunks(bytes) {
    var out = [];
    for (var i = 0; i < bytes.length; i += 255) {
      var chunk = bytes.slice(i, i + 255);
      out.push(chunk.length);
      for (var j = 0; j < chunk.length; j++) out.push(chunk[j]);
    }
    out.push(0);
    return out;
  }

  function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }

  function GifEncoder(opts) {
    var width = opts.width, height = opts.height;
    var repeat = opts.repeat === undefined ? 0 : opts.repeat; // 0 loop, -1 no loop
    var delayCentis = opts.delay === undefined ? 10 : opts.delay; // 1/100 sec
    var parts = [];
    var header = ['G', 'I', 'F', '8', '9', 'a'].concat(u16(width), u16(height));

    // global color table placeholder: packed + bg + aspect; real GCT written on finish
    header = header.concat([0x00, 0x00, 0x00]);

    var netscape = null;
    if (repeat >= 0) {
      netscape = [0x21, 0xff, 0x0b].concat(
        'NETSCAPE2.0'.split('').map(function (c) { return c.charCodeAt(0); }),
        [0x03, 0x01].concat(u16(repeat), [0x00])
      );
    }

    var frames = [];

    this.addFrame = function (imageData) {
      var rgba = imageData.data;
      var palette = buildPalette(rgba, 256);
      var lut = nearestLut(palette);
      var index = toIndexed(rgba, palette, lut);
      frames.push({ index: index, palette: palette });
    };

    this.finish = function () {
      if (frames.length === 0) return new Uint8Array(new ArrayBuffer(0));
      var palette = frames[0].palette;
      var sizePow = 1;
      while (sizePow < palette.length) sizePow <<= 1;
      var minCodeSize = Math.max(2, Math.ceil(Math.log2(sizePow)));

      var out = header.slice();
      out[10] = 0x80 | ((minCodeSize - 1) << 4) | (minCodeSize - 1);
      out[11] = 0;
      out[12] = 0;
      for (var p = 0; p < sizePow; p++) {
        var col = p < palette.length ? palette[p] : [0, 0, 0];
        out = out.concat(col[0], col[1], col[2]);
      }
      if (netscape) out = out.concat(netscape);

      for (var f = 0; f < frames.length; f++) {
        var fr = frames[f];
        out = out.concat(
          [0x21, 0xf9, 0x04, 0x00],
          u16(delayCentis),
          [0x00, 0x00] // transparent index + terminator (no transparency)
        );
        var lzw = lzwEncode(fr.index, minCodeSize);
        out = out.concat([0x2c].concat(u16(0), u16(0), u16(width), u16(height), [minCodeSize]));
        out = out.concat(chunks(lzw));
      }
      out.push(0x3b);

      var buf = new Uint8Array(out.length);
      for (var i = 0; i < out.length; i++) buf[i] = out[i];
      return buf.buffer;
    };
  }

  function staticGif(width, height, imageData) {
    var enc = new GifEncoder({ width: width, height: height, delay: 10, repeat: 0 });
    enc.addFrame(imageData);
    return enc.finish();
  }

  global.C2G = {
    GifEncoder: GifEncoder,
    staticGif: staticGif,
  };
})(typeof self !== 'undefined' ? self : globalThis);