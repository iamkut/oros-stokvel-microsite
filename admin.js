(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // Full known store list, flattened + deduped from the province map used by
  // the public form. Keeping it in sync here lets the admin filter show every
  // valid store even before any submissions reference it. "Other" is the
  // free-form bucket submitted when no listed store matches.
  var STORES_BY_PROVINCE = {
    'Eastern Cape': ['Trade Value', 'Afri-save Kariega', 'Trade Value Gqeberha', 'Broadway Gqeberha'],
    'Free State': ['Bibi Cash & Carry - Qwaqwa', 'Devland Cash & Carry Welkom', 'TFS Bloemfontein', 'Transito Cash & Carry Welkom'],
    'Gauteng': [
      'Devland Cash & Carry Johannesburg', 'Advance Pretoria', 'Kit Kat Pretoria West', 'Kit Kat Silverton',
      'Kit Kat Benoni', 'Kit Kat Mamelodi', 'Kit Kat Kliptown', 'Big Save Waltloo', 'Big Save Mabopane',
      'Big Save Hammanskraal', 'Big Save Tshwane Market', 'Big Save Marble Hall', 'Hazyview Cash & Carry',
      'Savemoor Cash & Carry', 'Savemoor Tembisa', 'Sunshine Westgate', 'Sunshine Electron', 'Sunshine Plaza',
      'Devland Springs', 'Makro Germiston', 'Makro Riversands', 'Makro Crown Mines'
    ],
    'KwaZulu-Natal': [
      'Trade Port - Phoenix', 'Bargain Wholesaler', 'Phoenix Cash & Carry - Empangeni', 'Supersave PMB',
      'Macksons uMzimkhulu', 'Phoenix Cash & Carry - Pietermaritzburg', 'Phoenix Cash & Carry - Prospecton',
      'Jadwats', 'Makro Amanzimtoti'
    ],
    'Limpopo': ['Kismat Cash & Carry'],
    'Mpumalanga': ['Happy Family Witbank', 'Goldfields Witbank', 'Devland Ermelo', 'Otees Cash & Carry'],
    'Northern Cape': [],
    'North West': [
      'Food Town Hyper Thlabane Monareng Street', 'Three Star Cash & Carry Rustenburg',
      'Trans Food Town Hyper Klopper Street', 'Powertrade Kuruman', 'Powertrade Vryburg Cash & Carry'
    ],
    'Western Cape': ['Foodtown Hyper Khayelitsha', 'Makro Ottery']
  };
  var ALL_STORES = (function () {
    var seen = Object.create(null);
    var flat = [];
    Object.keys(STORES_BY_PROVINCE).forEach(function (p) {
      STORES_BY_PROVINCE[p].forEach(function (s) {
        if (!seen[s]) { seen[s] = true; flat.push(s); }
      });
    });
    flat.sort(function (a, b) { return a.localeCompare(b); });
    flat.push('Other');
    return flat;
  })();

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

  var storeFilter = '';

  function readFilters() {
    return {
      q: $('f-q').value.trim(),
      flavour: $('f-flavour').value,
      province: $('f-province').value,
      store: storeFilter,
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
    setStoreFilter('');
    $('f-optin').value = '';
    $('f-from').value = '';
    $('f-to').value = '';
    renderAll();
  }

  // ---------- Store searchable combobox ----------
  var storeBtn    = $('f-store-btn');
  var storePanel  = $('f-store-panel');
  var storeList   = $('f-store-list');
  var storeLabel  = $('f-store-label');
  var storeSearch = $('f-store-search');

  function setStoreFilter(value) {
    storeFilter = value || '';
    storeLabel.textContent = storeFilter || 'All';
    storeBtn.classList.toggle('selected', !!storeFilter);
  }

  function renderStoreCombo(filter) {
    storeList.replaceChildren();
    var q = (filter || '').trim().toLowerCase();

    var allLi = document.createElement('li');
    allLi.className = 'combo-opt all';
    allLi.setAttribute('role', 'option');
    allLi.setAttribute('data-value', '');
    allLi.setAttribute('aria-selected', storeFilter === '' ? 'true' : 'false');
    allLi.textContent = 'All stores';
    allLi.addEventListener('click', function () { pickStore(''); });
    storeList.appendChild(allLi);

    var shown = 0;
    ALL_STORES.forEach(function (name) {
      if (q && name.toLowerCase().indexOf(q) === -1) return;
      var li = document.createElement('li');
      li.className = 'combo-opt';
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', name);
      li.setAttribute('aria-selected', storeFilter === name ? 'true' : 'false');
      li.textContent = name;
      li.addEventListener('click', function () { pickStore(name); });
      storeList.appendChild(li);
      shown++;
    });
    if (!shown && q) {
      var empty = document.createElement('li');
      empty.className = 'combo-empty';
      empty.textContent = 'No stores match "' + q + '".';
      storeList.appendChild(empty);
    }
  }

  function openStoreCombo() {
    storePanel.hidden = false;
    storeBtn.setAttribute('aria-expanded', 'true');
    renderStoreCombo(storeSearch.value);
    setTimeout(function () { storeSearch.focus(); }, 0);
  }
  function closeStoreCombo() {
    storePanel.hidden = true;
    storeBtn.setAttribute('aria-expanded', 'false');
  }
  function pickStore(name) {
    setStoreFilter(name);
    closeStoreCombo();
    renderAll();
  }

  storeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (storePanel.hidden) openStoreCombo(); else closeStoreCombo();
  });
  storeSearch.addEventListener('input', function () {
    renderStoreCombo(storeSearch.value);
  });
  storeSearch.addEventListener('click', function (e) { e.stopPropagation(); });
  storeSearch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var first = storeList.querySelector('.combo-opt:not(.all)');
      if (first) pickStore(first.getAttribute('data-value'));
    }
  });
  document.addEventListener('click', function (e) {
    if (!storePanel.hidden && !$('store-combo').contains(e.target)) closeStoreCombo();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !storePanel.hidden) {
      closeStoreCombo();
      storeBtn.focus();
    }
  });

  // Debounced search typing
  var qTimer = null;
  $('f-q').addEventListener('input', function () {
    if (qTimer) clearTimeout(qTimer);
    qTimer = setTimeout(renderAll, 150);
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

  setStoreFilter('');
  renderStoreCombo('');

  loadMe()
    .then(function (data) {
      if (!data) return;
      document.body.style.visibility = 'visible';
      load();
    })
    .catch(goToLogin);
})();
