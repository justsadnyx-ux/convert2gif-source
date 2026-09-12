(function () {
  var CLIENT_ID = '<YOUR_APPLICATION_ID>';
  var INVITE_URL =
    'https://discord.com/oauth2/authorize?client_id=' +
    CLIENT_ID +
    '&scope=bot&permissions=121856';

  // Year in footers
  document.querySelectorAll('#year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // All invite buttons across pages
  document.querySelectorAll('[id^="inviteBtn"]').forEach(function (el) {
    el.href = INVITE_URL;
  });

  // Mobile nav toggle (injected so every page shares it)
  var nav = document.querySelector('.nav');
  if (nav && nav.querySelector('.nav-inner') && !nav.querySelector('.nav-toggle')) {
    var toggler = document.createElement('button');
    toggler.className = 'nav-toggle grid';
    toggler.setAttribute('aria-label', 'Toggle menu');
    toggler.setAttribute('aria-expanded', 'false');
    toggler.innerHTML = '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
    nav.querySelector('.nav-inner').appendChild(toggler);
    toggler.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggler.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggler.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Scroll-reveal
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('in'); });
    }
  }

  var online = false;
  var lastPoll = null;

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  var countCache = {};

  function countTo(el, target) {
    if (!el) return;
    var from = 0;
    var cached = countCache[el.id];
    if (cached !== undefined) from = cached;
    var dur = 700;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(from + (target - from) * eased);
      countCache[el.id] = val;
      el.textContent = fmt(val);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function fillStats(data) {
    var gifs = document.getElementById('statGifs');
    var servers = document.getElementById('statServers');
    var status = document.getElementById('statStatus');
    if (gifs) countTo(gifs, data.gifCount);
    if (servers) countTo(servers, data.serverCount);
    if (status) {
      status.textContent = data.online ? 'Online' : 'Idle';
      status.style.backgroundOrigin = '';
    }
  }

  function loadStats() {
    fetch('/api/stats')
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (data) {
        online = !!data.online;
        fillStats(data);
        lastPoll = data.updatedAt || Date.now();
        updatePing();
      })
      .catch(function () {
        var gifs = document.getElementById('statGifs');
        if (gifs) gifs.textContent = '—';
      });
  }

  function updatePing() {
    var pingDot = document.getElementById('pingDot');
    var pingText = document.getElementById('pingText');
    var updatedAt = document.getElementById('updatedAt');
    if (!pingDot) return;

    if (online) {
      pingDot.classList.add('online');
      pingDot.classList.remove('idle');
      pingText.textContent = 'Bot is online';
    } else {
      pingDot.classList.add('idle');
      pingDot.classList.remove('online');
      pingText.textContent = 'Bot is idle';
    }
    if (updatedAt) updatedAt.textContent = '· updated just now';
  }

  // Only run stats polling on pages that have stat elements
  if (document.getElementById('statGifs')) {
    loadStats();
    setInterval(loadStats, 30000);
  }

  // Back to top
  var toTop = document.createElement('button');
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(toTop);
  var toTopTimer = null;
  window.addEventListener('scroll', function () {
    clearTimeout(toTopTimer);
    toTopTimer = setTimeout(function () {
      toTop.classList.toggle('show', window.scrollY > 480);
    }, 60);
  }, { passive: true });

  // Pill-group keyboard navigation (radio groups)
  document.querySelectorAll('.pill-group').forEach(function (group) {
    if (group.getAttribute('role') !== 'radiogroup') return;
    var pills = Array.prototype.slice.call(group.querySelectorAll('.pill'));
    group.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var idx = pills.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      var next = e.key === 'ArrowRight' ? (idx + 1) % pills.length : (idx - 1 + pills.length) % pills.length;
      pills[next].focus();
      pills[next].click();
    });
  });
})();