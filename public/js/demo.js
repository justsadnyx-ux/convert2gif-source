(function () {
  var demoImg = document.getElementById('demoImg');
  var demoDownload = document.getElementById('demoDownload');
  if (!demoImg) return;

  var SIZE = 360;
  var FRAMES = 14;
  var DELAY = 10; // centiseconds

  var canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  var ctx = canvas.getContext('2d');

  var state = { mode: 'static', sample: 'waves' };
  var renderToken = 0;

  var CAPTIONS = {
    staticTop: 'Your image becomes a real .gif file — static, clean, no motion.',
    animated: 'Video-style animated loop, built frame by frame like a real video→GIF.',
  };

  function bindGroup(id, attr, initial, onChange, onChanged) {
    var group = document.getElementById(id);
    if (!group) return;
    group.querySelectorAll('.pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        group.querySelectorAll('.pill').forEach(function (b) {
          b.classList.remove('on');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('on');
        btn.setAttribute('aria-checked', 'true');
        onChange(btn.getAttribute(attr));
        if (onChanged) onChanged();
      });
    });
  }

  function drawStatic() {
    var g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, '#2dd4bf');
    g.addColorStop(0.5, '#0f172a');
    g.addColorStop(1, '#fb923c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);

    var cx = SIZE / 2;
    var cy = SIZE / 2;
    drawStar(ctx, cx, cy, 130, 56, 5, '#fbbf24', 'rgba(0,0,0,0.45)');

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GIF', cx + 46, cy + 6);
  }

  function drawWaves(t) {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (var w = 0; w < 3; w++) {
      ctx.beginPath();
      for (var x = 0; x <= SIZE; x += 4) {
        var y = SIZE / 2 + Math.sin(x / 34 + t * Math.PI * 2 - w * 1.1) * (34 + w * 12) + (w - 1) * 44;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 7;
      ctx.strokeStyle = w === 0 ? '#2dd4bf' : w === 1 ? '#fb923c' : '#fbbf24';
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawPulse(t) {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, SIZE, SIZE);
    var cx = SIZE / 2;
    var cy = SIZE / 2;
    for (var i = 0; i < 4; i++) {
      var ph = ((t + i / 4) % 1);
      var r = 30 + ph * 120;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0 ? '#2dd4bf' : '#fb923c';
      ctx.lineWidth = 7;
      ctx.globalAlpha = 1 - ph * 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  }

  function drawBlob(t) {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, SIZE, SIZE);
    var cx = SIZE / 2;
    var cy = SIZE / 2;
    var g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 170);
    g.addColorStop(0, '#22d3ee');
    g.addColorStop(0.55, '#2dd4bf');
    g.addColorStop(1, '#0e292c');
    var r = 120 + Math.sin(t * Math.PI * 2) * 22;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.bezierCurveTo(cx + r * 1.15, cy - r, cx + r * 1.15, cy + r, cx, cy + r);
    ctx.bezierCurveTo(cx - r * 1.15, cy + r, cx - r * 1.15, cy - r, cx, cy - r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 26, cy - 26, 13, 0, Math.PI * 2);
    ctx.arc(cx + 28, cy - 30, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#03140f';
    ctx.fill();
  }

  var ANIMATED = { waves: drawWaves, pulse: drawPulse, blob: drawBlob };

  function drawStar(c, x, y, outer, inner, points, fill, stroke) {
    var rot = -Math.PI / 2;
    c.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? outer : inner;
      var a = rot + (i * Math.PI) / points;
      var px = x + Math.cos(a) * r;
      var py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) { c.lineWidth = 26; c.strokeStyle = stroke; c.stroke(); }
  }

  function render() {
    var token = ++renderToken;
    if (state.mode === 'static') {
      drawStatic();
      var data = ctx.getImageData(0, 0, SIZE, SIZE);
      var buf = C2G.staticGif(SIZE, SIZE, data);
      finish(buf, 'convert2gif-static.gif');
    } else {
      var draw = ANIMATED[state.sample] || drawWaves;
      var enc = new C2G.GifEncoder({ width: SIZE, height: SIZE, repeat: 0, delay: DELAY });
      for (var i = 0; i < FRAMES; i++) {
        draw(i / (FRAMES - 1));
        enc.addFrame(ctx.getImageData(0, 0, SIZE, SIZE));
      }
      finish(enc.finish(), 'convert2gif-' + state.sample + '.gif');
    }

    function finish(buf, name) {
      if (token !== renderToken) return;
      var blob = new Blob([buf], { type: 'image/gif' });
      var url = URL.createObjectURL(blob);
      demoImg.onload = function () { URL.revokeObjectURL(url); };
      demoImg.src = url;
      if (demoDownload) {
        demoDownload.href = url;
        demoDownload.setAttribute('download', name);
      }
    }
  }

  function syncCaption() {
    var cap = document.getElementById('demoCaption');
    var sampleField = document.getElementById('demoSampleField');
    if (cap) cap.textContent = state.mode === 'static' ? CAPTIONS.staticTop : CAPTIONS.animated;
    if (sampleField) sampleField.style.display = state.mode === 'static' ? 'none' : '';
  }

  bindGroup('demoMode', 'data-mode', 'static', function (v) {
    state.mode = v;
    syncCaption();
    render();
  });
  bindGroup('demoSamples', 'data-sample', 'waves', function (v) {
    state.sample = v;
    render();
  });

  syncCaption();
  render();
})();