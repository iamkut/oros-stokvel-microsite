(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var form = $('login-form');
  var errEl = $('l-error');
  var submitBtn = $('l-submit');

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }
  function clearError() {
    errEl.textContent = '';
    errEl.hidden = true;
  }

  function nextUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('next');
      if (!raw) return '/admin.html';
      // Only allow same-origin, path-only redirects
      if (raw.charAt(0) !== '/' || raw.indexOf('//') === 1) return '/admin.html';
      return raw;
    } catch (e) { return '/admin.html'; }
  }

  // If already signed in, skip the form.
  fetch('/api/admin/me', { credentials: 'include' })
    .then(function (r) {
      if (r.ok) window.location.replace(nextUrl());
    })
    .catch(function () {});

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    var username = $('l-user').value.trim();
    var password = $('l-pass').value;
    if (!username || !password) {
      showError('Enter your username and password.');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (r) {
        if (r.status === 200 && r.data && r.data.ok) {
          window.location.replace(nextUrl());
          return;
        }
        showError((r.data && r.data.error) || 'Sign-in failed.');
      })
      .catch(function () {
        showError('Network error. Try again.');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
      });
  });

  $('l-user').focus();
})();
