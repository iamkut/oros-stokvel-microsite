(function () {
  'use strict';

  // The seven Oros 2L squash variants shown in the reference line-up.
  // Selecting a flavour swaps `.flavour-popup img`'s src to the matching PNG.
  var FLAVOURS = [
    { name: 'Original',  dot: '#f58220', bottle: 'bottle-original.png'  },
    { name: 'Naartjie',  dot: '#ff6a1a', bottle: 'bottle-naartjie.png'  },
    { name: 'Mango',     dot: '#ffb000', bottle: 'bottle-mango.png'     },
    { name: 'Pineapple', dot: '#ffd54f', bottle: 'bottle-pineapple.png' },
    { name: 'Twist',     dot: '#8bc34a', bottle: 'bottle-twist.png'     },
    { name: 'Tropical',  dot: '#ff5a3c', bottle: 'bottle-tropical.png'  },
    { name: 'Guava',     dot: '#e53935', bottle: 'bottle-guava.png'     }
  ];
  var STORAGE_KEY = 'oros-submissions';
  var STEP_KEY = 'oros-step';
  var SHARE_TEXT = 'Stand the chance to WIN your share of R20 000 with Oros! Enter here: ';

  var state = {
    step: 'landing', optIn: null, name: '', phone: '', flavour: '', consent: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    landing: $('screen-landing'),
    form: $('screen-form'),
    done: $('screen-done')
  };
  var stage = $('stage');

  // ---------- Parallax (pointer + device orientation) ----------
  function setParallax(x, y) {
    stage.style.setProperty('--px', x.toFixed(3));
    stage.style.setProperty('--py', y.toFixed(3));
  }
  stage.addEventListener('pointermove', function (e) {
    var r = stage.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width - 0.5) * -2;
    var y = ((e.clientY - r.top) / r.height - 0.5) * -2;
    setParallax(x, y);
  });
  stage.addEventListener('pointerleave', function () { setParallax(0, 0); });
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null) return;
    var x = Math.max(-1, Math.min(1, e.gamma / 30));
    var y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    setParallax(x, y);
  });

  // ---------- Flavour pills + bottle popup ----------
  function renderFlavours() {
    var wrap = $('f-flavours');
    wrap.innerHTML = '';
    FLAVOURS.forEach(function (f) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flavour-pill';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-pressed', state.flavour === f.name ? 'true' : 'false');
      btn.setAttribute('aria-checked', state.flavour === f.name ? 'true' : 'false');
      btn.innerHTML = '<span class="dot" style="background:' + f.dot + '"></span>' +
        '<span class="pill-label">' + f.name + '</span>';
      btn.addEventListener('click', function () {
        state.flavour = f.name;
        clearError();
        renderFlavours();
        showFlavourBottle(f);
      });
      wrap.appendChild(btn);
    });
  }

  function showFlavourBottle(f) {
    var popup = $('f-popup');
    var img = popup.querySelector('img');
    // Restart the bounce animation on each selection by removing then
    // re-adding `.show` across a forced reflow - otherwise picking a
    // different flavour would just swap the image without re-playing.
    popup.classList.remove('show');
    img.src = 'assets/' + f.bottle;
    img.alt = 'Oros ' + f.name;
    popup.setAttribute('aria-hidden', 'false');
    void popup.offsetWidth;
    popup.classList.add('show');
  }

  function hideFlavourBottle() {
    var popup = $('f-popup');
    popup.classList.remove('show');
    popup.setAttribute('aria-hidden', 'true');
  }

  function goTo(step) {
    state.step = step;
    Object.keys(screens).forEach(function (k) { screens[k].hidden = (k !== step); });
    try { localStorage.setItem(STEP_KEY, step); } catch (e) {}
    clearError();
    if (step === 'done') updateShareLink();
  }
  function clearError() { $('f-error').textContent = ''; }

  function validate() {
    if (state.name.trim().length < 2) return 'Please enter your name and surname.';
    var phone = state.phone.replace(/\s/g, '');
    if (!/^(\+27|0)\d{9}$/.test(phone)) return 'Please enter a valid SA contact number.';
    if (!state.flavour) return 'Please select a flavour.';
    if (!state.consent) return 'Please confirm you are 18+ and accept the Ts & Cs.';
    return null;
  }

  function loadSubmissions() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveSubmission(entry) {
    var list = loadSubmissions();
    list.push(entry);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    catch (e) { console.warn('Could not persist submission:', e); }
  }

  function updateShareLink() {
    var url = location.href.split('#')[0];
    $('d-share').href = 'https://wa.me/?text=' + encodeURIComponent(SHARE_TEXT + url);
  }

  // ---------- CSV / PDF ----------
  function toCSV(rows) {
    if (!rows.length) return '';
    var cols = ['timestamp', 'name', 'phone', 'flavour', 'optIn', 'consent'];
    var esc = function (v) {
      if (v == null) return '';
      var s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = [cols.join(',')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { return esc(r[c]); }).join(','));
    });
    return lines.join('\r\n');
  }
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadCSV() {
    var rows = loadSubmissions();
    if (!rows.length) { alert('No entries yet.'); return; }
    var stamp = new Date().toISOString().slice(0, 10);
    download('oros-stokvel-entries-' + stamp + '.csv', '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
  }
  function downloadPDF() { window.print(); }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function renderAdmin() {
    var rows = loadSubmissions();
    $('admin-meta').textContent = rows.length + ' ' + (rows.length === 1 ? 'entry' : 'entries') +
      ' - stored locally in this browser (localStorage).';
    var tbl = $('admin-table');
    if (!rows.length) {
      tbl.innerHTML = '<div class="empty">No entries yet. Submissions from the microsite will appear here.</div>';
      return;
    }
    var head = '<tr><th>#</th><th>Timestamp</th><th>Name</th><th>Phone</th><th>Flavour</th><th>Opt-in</th><th>Consent</th></tr>';
    var body = rows.map(function (r, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapeHTML(r.timestamp) + '</td>' +
        '<td>' + escapeHTML(r.name) + '</td>' +
        '<td>' + escapeHTML(r.phone) + '</td>' +
        '<td>' + escapeHTML(r.flavour) + '</td>' +
        '<td>' + (r.optIn ? 'Yes' : 'No') + '</td>' +
        '<td>' + (r.consent ? 'Yes' : 'No') + '</td>' +
      '</tr>';
    }).join('');
    tbl.innerHTML = '<table>' + head + body + '</table>';
  }
  function clearAll() {
    if (!confirm('Delete all stored entries from this browser? This cannot be undone.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    renderAdmin();
  }
  function applyHash() {
    var isAdmin = location.hash === '#admin';
    $('admin').hidden = !isAdmin;
    stage.style.display = isAdmin ? 'none' : '';
    if (isAdmin) renderAdmin();
  }

  // ---------- Wire up ----------
  $('opt-yes').addEventListener('click', function () { state.optIn = true;  goTo('form'); });
  $('opt-no') .addEventListener('click', function () { state.optIn = false; goTo('form'); });

  $('f-name') .addEventListener('input',  function (e) { state.name  = e.target.value; clearError(); });
  $('f-phone').addEventListener('input',  function (e) { state.phone = e.target.value; clearError(); });
  $('f-consent').addEventListener('change', function (e) { state.consent = e.target.checked; clearError(); });

  $('entry-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = validate();
    if (err) { $('f-error').textContent = err; return; }
    saveSubmission({
      timestamp: new Date().toISOString(),
      name: state.name.trim(),
      phone: state.phone.replace(/\s/g, ''),
      flavour: state.flavour,
      optIn: state.optIn === true,
      consent: state.consent === true
    });
    goTo('done');
  });

  $('d-restart').addEventListener('click', function () {
    state = { step: 'landing', optIn: null, name: '', phone: '', flavour: '', consent: false };
    $('f-name').value = '';
    $('f-phone').value = '';
    $('f-consent').checked = false;
    hideFlavourBottle();
    renderFlavours();
    goTo('landing');
  });

  $('a-csv').addEventListener('click', downloadCSV);
  $('a-pdf').addEventListener('click', downloadPDF);
  $('a-refresh').addEventListener('click', renderAdmin);
  $('a-clear').addEventListener('click', clearAll);
  $('a-back').addEventListener('click', function (e) { e.preventDefault(); location.hash = ''; });

  window.addEventListener('hashchange', applyHash);

  renderFlavours();
  try {
    var saved = localStorage.getItem(STEP_KEY);
    if (saved && screens[saved]) goTo(saved); else goTo('landing');
  } catch (e) { goTo('landing'); }
  applyHash();
})();
