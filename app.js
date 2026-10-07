(function () {
  'use strict';

  var FLAVOURS = [
    { name: 'Orange',       dot: '#f58220', bottle: 'bottle-original.png'    },
    { name: 'Tropical',     dot: '#ff5a3c', bottle: 'bottle-tropical.png'    },
    { name: 'Guava',        dot: '#e53935', bottle: 'bottle-guava.png'       },
    { name: 'Lemos',        dot: '#8bc34a', bottle: 'bottle-lemos.png'       },
    { name: 'Naartjie',     dot: '#ff6a1a', bottle: 'bottle-naartjie.png'    },
    { name: 'Mango',        dot: '#ffb000', bottle: 'bottle-mango.png'       },
    { name: 'Pineapple',    dot: '#ffd54f', bottle: 'bottle-pineapple.png'   },
    { name: 'Passionfruit', dot: '#6a1b9a', bottle: 'bottle-passionfruit.png' }
  ];

  var PROVINCES = [
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  ];

  var state = {
    step: 'landing', optIn: null, name: '', phone: '',
    flavour: '', province: '', consent: false
  };
  var turnstileWidgetId = null;
  var formOpenedAt = 0;

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

  function goTo(step) {
    state.step = step;
    Object.keys(screens).forEach(function (k) { screens[k].hidden = (k !== step); });
    clearError();
    if (step === 'form') {
      if (!formOpenedAt) formOpenedAt = Date.now();
      mountTurnstile();
    }
  }
  function clearError() { $('f-error').textContent = ''; }

  function validate() {
    if (state.name.trim().length < 2) return 'Please enter your name and surname.';
    var phone = state.phone.replace(/\s/g, '');
    if (!/^(\+27|0)\d{9}$/.test(phone)) return 'Please enter a valid SA contact number.';
    if (!state.flavour) return 'Please select a flavour.';
    if (!state.province) return 'Please select your province.';
    if (!state.consent) return 'Please confirm you are 18+ and accept the Ts & Cs.';
    return null;
  }

  // ---------- Turnstile ----------
  function mountTurnstile() {
    if (turnstileWidgetId !== null) return;
    var container = $('f-turnstile');
    var cfg = window.OROS_CONFIG || {};
    if (!container || !cfg.turnstileSiteKey) return;

    function tryRender() {
      if (!window.turnstile) { setTimeout(tryRender, 150); return; }
      turnstileWidgetId = window.turnstile.render(container, {
        sitekey: cfg.turnstileSiteKey,
        theme: 'light',
        size: 'flexible'
      });
    }
    tryRender();
  }

  function getTurnstileToken() {
    if (!window.turnstile || turnstileWidgetId === null) return '';
    return window.turnstile.getResponse(turnstileWidgetId) || '';
  }

  function resetTurnstile() {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  // ---------- Submit ----------
  function setSubmitting(on) {
    var btn = $('f-submit');
    btn.disabled = on;
    btn.textContent = on ? 'Submitting...' : 'SUBMIT';
  }

  async function submitEntry(payload) {
    var res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error(data.error || 'Submission failed. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- Wire up ----------
  $('opt-yes').addEventListener('click', function () { state.optIn = true;  goTo('form'); });
  $('opt-no') .addEventListener('click', function () { state.optIn = false; goTo('form'); });

  $('f-back').addEventListener('click', function () {
    hideFlavourBottle();
    goTo('landing');
  });

  $('f-name') .addEventListener('input',  function (e) { state.name  = e.target.value; clearError(); });
  $('f-phone').addEventListener('input',  function (e) { state.phone = e.target.value; clearError(); });
  $('f-consent').addEventListener('change', function (e) { state.consent = e.target.checked; clearError(); });

  // ---------- Flavour dropdown ----------
  var ddBtn   = $('f-flavour-btn');
  var ddList  = $('f-flavour-list');
  var ddLabel = $('f-flavour-label');
  var ddDot   = $('f-flavour-dot');

  FLAVOURS.forEach(function (f) {
    var li = document.createElement('li');
    li.className = 'flavour-dd-opt';
    li.setAttribute('role', 'option');
    li.setAttribute('data-value', f.name);
    li.setAttribute('aria-selected', 'false');
    li.innerHTML =
      '<span class="dot" style="background:' + f.dot + '"></span>' +
      '<span>' + f.name + '</span>';
    li.addEventListener('click', function () { selectFlavour(f); });
    ddList.appendChild(li);
  });

  function openDropdown() {
    ddList.hidden = false;
    ddBtn.setAttribute('aria-expanded', 'true');
  }
  function closeDropdown() {
    ddList.hidden = true;
    ddBtn.setAttribute('aria-expanded', 'false');
  }
  function selectFlavour(f) {
    state.flavour = f.name;
    ddLabel.textContent = f.name;
    ddDot.style.background = f.dot;
    ddBtn.classList.add('selected');
    Array.prototype.forEach.call(ddList.children, function (li) {
      li.setAttribute('aria-selected', li.getAttribute('data-value') === f.name ? 'true' : 'false');
    });
    closeDropdown();
    clearError();
    showFlavourBottle(f);
  }

  ddBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (ddList.hidden) { closeProvinceDropdown(); openDropdown(); }
    else closeDropdown();
  });
  document.addEventListener('click', function (e) {
    if (!ddList.hidden && !$('f-flavour-dd').contains(e.target)) closeDropdown();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !ddList.hidden) {
      closeDropdown();
      ddBtn.focus();
    }
  });

  // ---------- Province dropdown (reuses flavour-dd styling) ----------
  var pvBtn   = $('f-province-btn');
  var pvList  = $('f-province-list');
  var pvLabel = $('f-province-label');

  PROVINCES.forEach(function (p) {
    var li = document.createElement('li');
    li.className = 'flavour-dd-opt';
    li.setAttribute('role', 'option');
    li.setAttribute('data-value', p);
    li.setAttribute('aria-selected', 'false');
    li.innerHTML = '<span>' + p + '</span>';
    li.addEventListener('click', function () { selectProvince(p); });
    pvList.appendChild(li);
  });

  function openProvinceDropdown() {
    pvList.hidden = false;
    pvBtn.setAttribute('aria-expanded', 'true');
  }
  function closeProvinceDropdown() {
    pvList.hidden = true;
    pvBtn.setAttribute('aria-expanded', 'false');
  }
  function selectProvince(p) {
    state.province = p;
    pvLabel.textContent = p;
    pvBtn.classList.add('selected');
    Array.prototype.forEach.call(pvList.children, function (li) {
      li.setAttribute('aria-selected', li.getAttribute('data-value') === p ? 'true' : 'false');
    });
    closeProvinceDropdown();
    clearError();
  }

  pvBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (pvList.hidden) { closeDropdown(); openProvinceDropdown(); }
    else closeProvinceDropdown();
  });
  document.addEventListener('click', function (e) {
    if (!pvList.hidden && !$('f-province-dd').contains(e.target)) closeProvinceDropdown();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !pvList.hidden) {
      closeProvinceDropdown();
      pvBtn.focus();
    }
  });

  // ---------- Bottle popup ----------
  function showFlavourBottle(f) {
    var popup = $('f-popup');
    var img = popup.querySelector('img');
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

  $('entry-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = validate();
    if (err) { $('f-error').textContent = err; return; }

    var token = getTurnstileToken();
    if (!token) { $('f-error').textContent = 'Please complete the verification challenge.'; return; }

    setSubmitting(true);
    var hp = $('f-website');
    submitEntry({
      name: state.name.trim(),
      phone: state.phone.replace(/\s/g, ''),
      flavour: state.flavour,
      province: state.province,
      optIn: state.optIn === true,
      consent: state.consent === true,
      turnstileToken: token,
      website: hp ? hp.value : '',
      elapsedMs: formOpenedAt ? Date.now() - formOpenedAt : 0
    }).then(function () {
      goTo('done');
    }).catch(function (ex) {
      $('f-error').textContent = ex.message;
      resetTurnstile();
    }).finally(function () {
      setSubmitting(false);
    });
  });

  $('d-restart').addEventListener('click', function () {
    state = {
      step: 'landing', optIn: null, name: '', phone: '',
      flavour: '', province: '', consent: false
    };
    $('f-name').value = '';
    $('f-phone').value = '';
    $('f-consent').checked = false;
    ddLabel.textContent = 'Select a flavour';
    ddDot.style.background = '';
    ddBtn.classList.remove('selected');
    Array.prototype.forEach.call(ddList.children, function (li) {
      li.setAttribute('aria-selected', 'false');
    });
    pvLabel.textContent = 'Select your province';
    pvBtn.classList.remove('selected');
    Array.prototype.forEach.call(pvList.children, function (li) {
      li.setAttribute('aria-selected', 'false');
    });
    closeDropdown();
    closeProvinceDropdown();
    hideFlavourBottle();
    resetTurnstile();
    formOpenedAt = 0;
    var hp = $('f-website');
    if (hp) hp.value = '';
    goTo('landing');
  });

  // Also clear any step persisted by older versions so returning users land correctly.
  try { localStorage.removeItem('oros-step'); } catch (e) {}
  goTo('landing');
})();
