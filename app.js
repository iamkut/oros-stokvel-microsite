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
  var SHARE_TEXT = 'Stand the chance to WIN your share of R20 000 with Oros! Enter here: ';

  var state = {
    step: 'landing', optIn: null, name: '', phone: '', flavour: '', consent: false
  };
  var turnstileWidgetId = null;

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
    clearError();
    // PARKED: Turnstile disabled — restore `if (step === 'form') mountTurnstile();` to re-enable.
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

  function updateShareLink() {
    var url = location.href.split('#')[0];
    $('d-share').href = 'https://wa.me/?text=' + encodeURIComponent(SHARE_TEXT + url);
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

  $('f-name') .addEventListener('input',  function (e) { state.name  = e.target.value; clearError(); });
  $('f-phone').addEventListener('input',  function (e) { state.phone = e.target.value; clearError(); });
  $('f-consent').addEventListener('change', function (e) { state.consent = e.target.checked; clearError(); });

  $('entry-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = validate();
    if (err) { $('f-error').textContent = err; return; }

    // PARKED: Turnstile disabled — restore the token check and `turnstileToken: token` field to re-enable.
    setSubmitting(true);
    submitEntry({
      name: state.name.trim(),
      phone: state.phone.replace(/\s/g, ''),
      flavour: state.flavour,
      optIn: state.optIn === true,
      consent: state.consent === true
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
    state = { step: 'landing', optIn: null, name: '', phone: '', flavour: '', consent: false };
    $('f-name').value = '';
    $('f-phone').value = '';
    $('f-consent').checked = false;
    hideFlavourBottle();
    renderFlavours();
    resetTurnstile();
    goTo('landing');
  });

  renderFlavours();
  // Also clear any step persisted by older versions so returning users land correctly.
  try { localStorage.removeItem('oros-step'); } catch (e) {}
  goTo('landing');
})();
