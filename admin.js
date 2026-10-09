(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SAST_FMT = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  var SAST_DATE_FMT = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  function formatSAST(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return SAST_FMT.format(d);
  }
  function dateKeySAST(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return SAST_DATE_FMT.format(d);
  }
  function todaySAST() {
    return SAST_DATE_FMT.format(new Date());
  }

  var state = {
    all: [],
    filtered: [],
    sort: { key: 'created_at', dir: 'desc' }
  };

  function readFilters() {
    return {
      q: $('f-q').value.trim(),
      flavour: $('f-flavour').value,
      province: $('f-province').value,
      store: $('f-store').value.trim(),
      optIn: $('f-optin').value,
      from: $('f-from').value,
      to: $('f-to').value
    };
  }
  function filtersToQuery(f) {
    var p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.flavour) p.set('flavour', f.flavour);
    if (f.province) p.set('province', f.province);
    if (f.store) p.set('store', f.store);
    if (f.optIn) p.set('optIn', f.optIn);
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    var s = p.toString();
    return s ? '?' + s : '';
  }

  function matchesFilter(r, f) {
    if (f.q) {
      var ql = f.q.toLowerCase();
      if ((r.name || '').toLowerCase().indexOf(ql) === -1 &&
          (r.phone || '').toLowerCase().indexOf(ql) === -1) return false;
    }
    if (f.flavour && r.flavour !== f.flavour) return false;
    if (f.province && r.province !== f.province) return false;
    if (f.store && r.store !== f.store) return false;
    if (f.optIn === '1' && !r.opt_in) return false;
    if (f.optIn === '0' && r.opt_in) return false;
    if (f.from || f.to) {
      var day = dateKeySAST(r.created_at);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
    }
    return true;
  }

  function compare(a, b, key) {
    var av = a[key];
    var bv = b[key];
    if (key === 'opt_in' || key === 'consent') {
      av = av ? 1 : 0; bv = bv ? 1 : 0;
    }
    if (av === bv) return 0;
    return av < bv ? -1 : 1;
  }

  function applyFiltersAndSort() {
    var f = readFilters();
    state.filtered = state.all.filter(function (r) { return matchesFilter(r, f); });
    var key = state.sort.key;
    var dir = state.sort.dir === 'asc' ? 1 : -1;
    state.filtered.sort(function (a, b) { return compare(a, b, key) * dir; });
  }

  function updateExportLinks() {
    var q = filtersToQuery(readFilters());
    $('x-csv').href = '/api/admin/export.csv' + q;
    $('x-xlsx').href = '/api/admin/export.xlsx' + q;
    $('x-pdf').href = '/api/admin/export.pdf' + q;
  }

  function renderKpis() {
    var all = state.all;
    var filt = state.filtered;
    $('kpi-total').textContent = filt.length.toLocaleString();
    $('kpi-total-foot').textContent =
      filt.length === all.length
        ? 'All entries'
        : 'of ' + all.length.toLocaleString() + ' total';

    var today = todaySAST();
    var todayCount = 0;
    for (var i = 0; i < filt.length; i++) {
      if (dateKeySAST(filt[i].created_at) === today) todayCount++;
    }
    $('kpi-today').textContent = todayCount.toLocaleString();
    $('kpi-today-foot').textContent = today;

    var optCount = 0;
    for (var j = 0; j < filt.length; j++) if (filt[j].opt_in) optCount++;
    $('kpi-optin').textContent = optCount.toLocaleString();
    $('kpi-optin-foot').textContent = filt.length
      ? Math.round((optCount / filt.length) * 100) + '% of filtered'
      : '-';

    var tallies = flavourTally(filt);
    var top = tallies[0];
    $('kpi-topflav').textContent = top ? top.name : '-';
    $('kpi-topflav-foot').textContent = top
      ? top.count.toLocaleString() + ' entries'
      : '-';
  }

  function flavourTally(rows) {
    var map = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i].flavour || '-';
      map[f] = (map[f] || 0) + 1;
    }
    var out = [];
    for (var k in map) out.push({ name: k, count: map[k] });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  function renderBreakdown() {
    var box = $('breakdown');
    box.replaceChildren();
    var tallies = flavourTally(state.filtered);
    if (!tallies.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No entries to summarise.';
      box.appendChild(e);
      $('breakdown-note').textContent = '';
      return;
    }
    var max = tallies[0].count;
    var total = state.filtered.length;
    $('breakdown-note').textContent =
      tallies.length + (tallies.length === 1 ? ' flavour' : ' flavours');
    tallies.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'bar-row';

      var label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = t.name;

      var track = document.createElement('span');
      track.className = 'bar-track';
      var fill = document.createElement('span');
      fill.className = 'bar-fill';
      fill.style.width = (max ? (t.count / max) * 100 : 0) + '%';
      track.appendChild(fill);

      var val = document.createElement('span');
      val.className = 'bar-val';
      var pct = total ? Math.round((t.count / total) * 100) : 0;
      val.textContent = t.count + ' (' + pct + '%)';

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(val);
      box.appendChild(row);
    });
  }

  var COLUMNS = [
    { key: 'index', label: '#', sortable: false },
    { key: 'created_at', label: 'Timestamp (SAST)', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'flavour', label: 'Flavour', sortable: true },
    { key: 'province', label: 'Province', sortable: true },
    { key: 'store', label: 'Store', sortable: true },
    { key: 'opt_in', label: 'Opt-in', sortable: true },
    { key: 'consent', label: 'Consent', sortable: true }
  ];

  function renderTable() {
    var wrap = $('table-wrap');
    wrap.replaceChildren();

    $('table-note').textContent = state.filtered.length === state.all.length
      ? state.filtered.length + ' entries'
      : state.filtered.length + ' of ' + state.all.length + ' entries';

    if (!state.filtered.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = state.all.length
        ? 'No entries match the current filters.'
        : 'No entries yet.';
      wrap.appendChild(empty);
      return;
    }

    var table = document.createElement('table');
    table.className = 'data-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    COLUMNS.forEach(function (c) {
      var th = document.createElement('th');
      if (c.sortable) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'th-sort';
        btn.textContent = c.label;
        if (state.sort.key === c.key) {
          btn.classList.add('sorted', state.sort.dir);
          var arrow = document.createElement('span');
          arrow.className = 'th-arrow';
          arrow.textContent = state.sort.dir === 'asc' ? ' ▲' : ' ▼';
          btn.appendChild(arrow);
        }
        btn.addEventListener('click', function () {
          if (state.sort.key === c.key) {
            state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sort.key = c.key;
            state.sort.dir = c.key === 'created_at' ? 'desc' : 'asc';
          }
          applyFiltersAndSort();
          renderTable();
        });
        th.appendChild(btn);
      } else {
        th.textContent = c.label;
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    state.filtered.forEach(function (r, i) {
      var tr = document.createElement('tr');
      appendCell(tr, String(i + 1), 'num');
      appendCell(tr, formatSAST(r.created_at), 'nowrap');
      appendCell(tr, r.name || '');
      appendCell(tr, r.phone || '', 'mono');
      appendCell(tr, r.flavour || '');
      appendCell(tr, r.province || '');
      appendCell(tr, r.store || '');
      appendBadge(tr, r.opt_in, 'Yes', 'No');
      appendBadge(tr, r.consent, 'Yes', 'No');
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function appendCell(tr, text, cls) {
    var td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text == null ? '' : String(text);
    tr.appendChild(td);
  }
  function appendBadge(tr, truthy, yes, no) {
    var td = document.createElement('td');
    var span = document.createElement('span');
    span.className = 'badge ' + (truthy ? 'badge-ok' : 'badge-off');
    span.textContent = truthy ? yes : no;
    td.appendChild(span);
    tr.appendChild(td);
  }

  function renderAll() {
    applyFiltersAndSort();
    updateExportLinks();
    renderKpis();
    renderBreakdown();
    renderTable();
  }

  function setSub(text) { $('db-sub').textContent = text; }

  function goToLogin() {
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace('/login.html?next=' + next);
  }

  function load() {
    setSub('Loading entries...');
    fetch('/api/admin/entries', { credentials: 'include' })
      .then(function (res) {
        if (res.status === 401) { goToLogin(); throw new Error('unauth'); }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.all = data.entries || [];
        var now = SAST_FMT.format(new Date());
        setSub(
          state.all.length.toLocaleString() + ' total entries - last refresh ' + now + ' SAST'
        );
        refreshStoreOptions();
        renderAll();
      })
      .catch(function (err) {
        if (err && err.message === 'unauth') return;
        setSub('Failed to load entries: ' + err.message);
      });
  }

  function logout() {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
      .catch(function () {})
      .finally(function () { goToLogin(); });
  }

  function loadMe() {
    return fetch('/api/admin/me', { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { goToLogin(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data && data.user) {
          var el = $('db-user');
          el.textContent = 'Signed in as ' + data.user;
          el.hidden = false;
        }
        return data;
      });
  }

  function resetFilters() {
    $('f-q').value = '';
    $('f-flavour').value = '';
    $('f-province').value = '';
    $('f-store').value = '';
    $('f-optin').value = '';
    $('f-from').value = '';
    $('f-to').value = '';
    renderAll();
  }

  function refreshStoreOptions() {
    var dl = $('store-options');
    if (!dl) return;
    var seen = Object.create(null);
    var names = [];
    for (var i = 0; i < state.all.length; i++) {
      var s = state.all[i].store;
      if (s && !seen[s]) { seen[s] = true; names.push(s); }
    }
    names.sort();
    dl.replaceChildren();
    names.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    });
  }

  // Debounced search typing
  var qTimer = null;
  $('f-q').addEventListener('input', function () {
    if (qTimer) clearTimeout(qTimer);
    qTimer = setTimeout(renderAll, 150);
  });
  var storeTimer = null;
  $('f-store').addEventListener('input', function () {
    if (storeTimer) clearTimeout(storeTimer);
    storeTimer = setTimeout(renderAll, 150);
  });
  ['f-flavour', 'f-province', 'f-optin', 'f-from', 'f-to'].forEach(function (id) {
    $(id).addEventListener('change', renderAll);
  });

  $('btn-reset').addEventListener('click', resetFilters);
  $('btn-refresh').addEventListener('click', load);
  $('btn-print').addEventListener('click', function () { window.print(); });
  $('btn-logout').addEventListener('click', logout);

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') { load(); }
    if (e.key === '/') { e.preventDefault(); $('f-q').focus(); }
  });

  loadMe()
    .then(function (data) {
      if (!data) return;
      document.body.style.visibility = 'visible';
      load();
    })
    .catch(goToLogin);
})();
