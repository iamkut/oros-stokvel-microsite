(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var state = { phone: '', optIn: false };

  function showError(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError(id) {
    var el = $(id);
    el.textContent = '';
    el.hidden = true;
  }

  function setLookupBusy(on) {
    var btn = $('c-lookup');
    btn.disabled = on;
    btn.textContent = on ? 'Looking up...' : 'Search';
  }
  function setSaveBusy(on) {
    var btn = $('c-save');
    btn.disabled = on;
    btn.textContent = on ? 'Saving...' : 'Save';
  }

  function showResult(data) {
    state.phone = data.phone;
    state.optIn = !!data.optIn;
    $('c-greet').textContent = data.name
      ? 'Hi ' + data.name + ', your entry (' + data.phone + ') is on record.'
      : 'Entry for ' + data.phone + ' is on record.';
    $('c-optin').checked = state.optIn;
    clearError('c-save-error');
    $('c-success').hidden = true;
    $('lookup-form').hidden = true;
    $('c-result').hidden = false;
  }

  function resetToLookup() {
    state = { phone: '', optIn: false };
    $('c-result').hidden = true;
    $('lookup-form').hidden = false;
    clearError('c-error');
    clearError('c-save-error');
    $('c-success').hidden = true;
    $('c-phone').focus();
  }

  $('lookup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    clearError('c-error');

    var phone = $('c-phone').value.replace(/\s/g, '');
    if (!/^(\+27|0)\d{9}$/.test(phone)) {
      showError('c-error', 'Please enter a valid SA contact number.');
      return;
    }

    setLookupBusy(true);
    fetch('/api/consent/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone })
    }).then(function (res) {
      return res.json().then(function (data) { return { res: res, data: data }; });
    }).then(function (r) {
      if (!r.res.ok) {
        showError('c-error', r.data.error || 'Lookup failed. Please try again.');
        return;
      }
      if (!r.data.found) {
        showError('c-error', 'No entry found for that number.');
        return;
      }
      showResult(r.data);
    }).catch(function () {
      showError('c-error', 'Network error. Please try again.');
    }).finally(function () {
      setLookupBusy(false);
    });
  });

  $('c-optin').addEventListener('change', function (e) {
    state.optIn = e.target.checked;
    $('c-success').hidden = true;
    clearError('c-save-error');
  });

  $('c-save').addEventListener('click', function () {
    clearError('c-save-error');
    $('c-success').hidden = true;
    setSaveBusy(true);
    fetch('/api/consent/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: state.phone, optIn: state.optIn })
    }).then(function (res) {
      return res.json().then(function (data) { return { res: res, data: data }; });
    }).then(function (r) {
      if (!r.res.ok) {
        showError('c-save-error', r.data.error || 'Could not save. Please try again.');
        return;
      }
      state.optIn = !!r.data.optIn;
      $('c-optin').checked = state.optIn;
      $('c-success').hidden = false;
    }).catch(function () {
      showError('c-save-error', 'Network error. Please try again.');
    }).finally(function () {
      setSaveBusy(false);
    });
  });

  $('c-cancel').addEventListener('click', resetToLookup);
})();
