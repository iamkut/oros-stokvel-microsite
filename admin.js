(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  var SAST_FMT = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  function formatSAST(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return SAST_FMT.format(d) + ' SAST';
  }

  function makeCell(text) {
    var td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function render(entries) {
    setText('admin-meta', entries.length + ' ' +
      (entries.length === 1 ? 'entry' : 'entries') + '.');

    var tbl = $('admin-table');
    tbl.replaceChildren();

    if (!entries.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No entries yet.';
      tbl.appendChild(empty);
      return;
    }

    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['#', 'Timestamp', 'Name', 'Phone', 'Flavour', 'Opt-in', 'Consent']
      .forEach(function (h) {
        var th = document.createElement('th');
        th.textContent = h;
        headRow.appendChild(th);
      });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    entries.forEach(function (r, i) {
      var tr = document.createElement('tr');
      tr.appendChild(makeCell(i + 1));
      tr.appendChild(makeCell(formatSAST(r.created_at)));
      tr.appendChild(makeCell(r.name));
      tr.appendChild(makeCell(r.phone));
      tr.appendChild(makeCell(r.flavour));
      tr.appendChild(makeCell(r.opt_in ? 'Yes' : 'No'));
      tr.appendChild(makeCell(r.consent ? 'Yes' : 'No'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tbl.appendChild(table);
  }

  function load() {
    setText('admin-meta', 'Loading...');
    fetch('/api/admin/entries', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { render(data.entries || []); })
      .catch(function (err) {
        setText('admin-meta', 'Failed to load entries: ' + err.message);
      });
  }

  $('a-pdf').addEventListener('click', function () { window.print(); });
  $('a-refresh').addEventListener('click', load);

  load();
})();
