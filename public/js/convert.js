(function () {
  var dropzone = document.getElementById('dropzone');
  var dropInner = document.getElementById('dropInner');
  var fileInput = document.getElementById('fileInput');
  var stage = document.getElementById('stage');
  var previewHint = document.getElementById('previewHint');
  var previewWrap = document.getElementById('previewWrap');
  var imgPreview = document.getElementById('imgPreview');
  var videoPreview = document.getElementById('videoPreview');
  var convCanvas = document.getElementById('convCanvas');
  var fpsInput = document.getElementById('fps');
  var maxWidthInput = document.getElementById('maxWidth');
  var foreverSwitch = document.getElementById('foreverSwitch');
  var convertBtn = document.getElementById('convertBtn');
  var resetBtn = document.getElementById('resetBtn');
  var resultWrap = document.getElementById('resultWrap');
  var resultImg = document.getElementById('resultImg');
  var downloadBtn = document.getElementById('downloadBtn');
  var resultMeta = document.getElementById('resultMeta');
  var fileChip = document.getElementById('fileChip');
  var rateStatus = document.getElementById('rateStatus');
  var rateLimitText = document.getElementById('rateLimitText');

  var MAX_FILE = 25 * 1024 * 1024;
  var MAX_FRAMES = 800;

  var file = null;
  var fileUrl = null;
  var isVideo = false;
  var isGifFile = false;
  var resultObjectUrl = null;

  function foreverChecked() {
    return foreverSwitch ? foreverSwitch.classList.contains('on') : true;
  }

  if (foreverSwitch) {
    foreverSwitch.addEventListener('click', function () {
      var on = foreverSwitch.classList.toggle('on');
      foreverSwitch.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    foreverSwitch.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        foreverSwitch.click();
      }
    });
  }

  function extOf(name) {
    var i = (name || '').lastIndexOf('.');
    return i === -1 ? '' : name.slice(i + 1).toLowerCase();
  }

  function checkRateLimit() {
    return fetch('/api/convert', {
      method: 'POST',
      headers: { 'x-check-only': '1' },
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (rateLimitText) rateLimitText.textContent = data.msg || 'unknown';
        if (data.allowed !== true) {
          rateStatus.textContent = 'Rate limit reached. Please wait and try again.';
          rateStatus.classList.add('limit');
        } else {
          rateStatus.textContent = 'Allowed. ' + (data.remaining || 0) + ' conversions left this window.';
          rateStatus.classList.remove('limit');
        }
        return data.allowed === true;
      })
      .catch(function () {
        if (rateLimitText) rateLimitText.textContent = 'rate limit service unavailable';
        return true;
      });
  }

  function registerConversion(blob) {
    try {
      var form = new FormData();
      form.append('file', new Blob([blob], { type: 'image/gif' }), 'output.gif');
      return fetch('/api/convert', { method: 'POST', body: form })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var statEl = document.getElementById('statGifs');
          if (statEl && data.gifCount != null) statEl.textContent = Number(data.gifCount).toLocaleString();
          if (rateLimitText && data.msg) rateLimitText.textContent = data.msg;
          return data;
        })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function showError(msg) {
    rateStatus.textContent = msg;
    rateStatus.classList.add('limit');
  }

  function clearError() {
    rateStatus.textContent = '';
    rateStatus.classList.remove('limit');
  }

  function fileSizeLabel(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  function loadFile(inputFile) {
    file = inputFile;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file);

    if (file.size > MAX_FILE) {
      showError('File is too large (max 25 MB). Try a smaller one.');
      return;
    }

    fileChip.hidden = false;
    fileChip.querySelector('.chip-name').textContent = file.name;
    fileChip.querySelector('.chip-size').textContent = fileSizeLabel(file.size);

    var type = file.type || '';
    var ext = extOf(file.name);
    isGifFile = ext === 'gif';
    isVideo = type.indexOf('video/') === 0 || ['mp4', 'mov', 'avi', 'webm', 'mkv'].indexOf(ext) !== -1;
    if (isGifFile) isVideo = false;

    dropzone.style.display = 'none';
    dropzone.classList.add('dz-small');
    stage.hidden = false;
    resultWrap.classList.add('hidden');
    clearError();

    if (previewHint) previewHint.classList.add('hidden');
    if (previewWrap) previewWrap.classList.remove('hidden');

    if (isVideo) {
      videoPreview.src = fileUrl;
      videoPreview.hidden = false;
      imgPreview.hidden = true;
      return new Promise(function (resolve) {
        videoPreview.onloadedmetadata = function () { resolve(); };
        if (videoPreview.readyState >= 1) resolve();
        setTimeout(resolve, 3000);
      });
    } else {
      imgPreview.src = fileUrl;
      imgPreview.hidden = false;
      videoPreview.hidden = true;
      return new Promise(function (resolve) {
        imgPreview.onload = function () { resolve(); };
        if (imgPreview.complete) resolve();
        setTimeout(resolve, 3000);
      });
    }
  }

  function drawImageScaled(img, canvas, maxW) {
    var scale = Math.min(1, maxW / img.width);
    var w = Math.max(1, Math.round(img.width * scale));
    var h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { w: w, h: h };
  }

  function convertImageToStaticGif() {
    if (!imgPreview.complete) return Promise.resolve(null);
    var maxW = parseInt(maxWidthInput.value, 10) || 480;
    var dims = drawImageScaled(imgPreview, convCanvas, maxW);
    var ctx = convCanvas.getContext('2d');
    var imageData = ctx.getImageData(0, 0, dims.w, dims.h);
    var buf = C2G.staticGif(dims.w, dims.h, imageData);
    return Promise.resolve(new Blob([buf], { type: 'image/gif' }));
  }

  function convertGifPassthrough() {
    return Promise.resolve(file);
  }

  function waitSeek(t) {
    return new Promise(function (resolve) {
      videoPreview.onseeked = function () { resolve(); };
      videoPreview.onerror = function () { resolve(); };
      if (videoPreview.readyState >= 2 && Math.abs(videoPreview.currentTime - t) < 0.02) resolve();
      setTimeout(resolve, 2000);
    });
  }

  function convertVideoToAnimatedGif() {
    var maxW = parseInt(maxWidthInput.value, 10) || 480;
    var fps = parseInt(fpsInput.value, 10) || 10;
    var duration = videoPreview.duration;
    if (!isFinite(duration) || duration <= 0) return Promise.reject(new Error('no_duration'));
    var frameCount = Math.max(1, Math.round(duration * fps));
    if (frameCount > MAX_FRAMES) return Promise.reject(new Error('too_many_frames'));

    var scale = Math.min(1, maxW / videoPreview.videoWidth);
    var w = Math.max(1, Math.round(videoPreview.videoWidth * scale));
    var h = Math.max(1, Math.round(videoPreview.videoHeight * scale));
    convCanvas.width = w;
    convCanvas.height = h;
    var ctx = convCanvas.getContext('2d');
    var delay = Math.max(1, Math.round(1000 / fps / 10)); // centiseconds

    var enc = new C2G.GifEncoder({
      width: w,
      height: h,
      repeat: foreverChecked() ? 0 : -1,
      delay: delay,
    });

    return (async function () {
      for (var i = 0; i < frameCount; i++) {
        var t = (i / frameCount) * duration;
        videoPreview.currentTime = t;
        await waitSeek(t);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        try { ctx.drawImage(videoPreview, 0, 0, w, h); } catch (e) {}
        enc.addFrame(ctx.getImageData(0, 0, w, h));
      }
      videoPreview.pause();
      var buf = enc.finish();
      return new Blob([buf], { type: 'image/gif' });
    })();
  }

  convertBtn.addEventListener('click', function () {
    if (!file) return;

    convertBtn.disabled = true;
    convertBtn.textContent = 'Converting…';
    resultWrap.classList.add('hidden');
    if (resultObjectUrl) {
      URL.revokeObjectURL(resultObjectUrl);
      resultObjectUrl = null;
    }

    var job = isVideo ? convertVideoToAnimatedGif() : isGifFile ? convertGifPassthrough() : convertImageToStaticGif();

    job
      .then(function (blob) {
        if (!blob || blob.size === 0) throw new Error('empty');
        var url = URL.createObjectURL(blob);
        resultObjectUrl = url;
        resultImg.src = url;
        downloadBtn.href = url;
        if (isGifFile && blob === file) {
          resultMeta.textContent = fileSizeLabel(blob.size) + ' · original GIF (not re-encoded)';
        } else {
          resultMeta.textContent = fileSizeLabel(blob.size);
        }
        resultWrap.classList.remove('hidden');
        registerConversion(blob);
      })
      .catch(function (e) {
        showError(
          e && e.message === 'too_many_frames'
            ? 'Video is too long for GIF conversion. Use a clip under ~1 minute.'
            : 'Conversion failed. Try a smaller file or lower FPS.'
        );
      })
      .then(function () {
        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert';
      });
  });

  resetBtn.addEventListener('click', function () {
    stage.hidden = true;
    dropzone.style.display = '';
    if (previewHint) previewHint.classList.remove('hidden');
    if (previewWrap) previewWrap.classList.add('hidden');
    imgPreview.hidden = true;
    videoPreview.hidden = true;
    videoPreview.pause();
    resultWrap.classList.add('hidden');
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
    file = null;
    fileUrl = null;
    resultObjectUrl = null;
    fileInput.value = '';
    fileChip.hidden = true;
    rateStatus.textContent = '';
    rateStatus.classList.remove('limit');
  });

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropInner.addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
  });
  fileInput.addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove('drag');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) {
          loadFile(f);
          return;
        }
      }
    }
  });

  checkRateLimit();
})();