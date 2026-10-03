/* ==========================================================================
   Conversor de temperatura
   Parte 1: lógica pura (TempCore). Sin acceso al DOM; también corre en Node.
   Parte 2: interfaz. Solo se inicializa si existe `document`.
   ========================================================================== */
(function (root) {
  'use strict';

  /* =======================================================================
     PARTE 1 — LÓGICA PURA
     ======================================================================= */

  // Tolerancia absoluta para comparar contra el cero absoluto sin falsos
  // rechazos por punto flotante (p. ej. -459.67 °F → 0 K da ~1e-14).
  const EPS = 1e-9;

  const SCALES = {
    C: { key: 'C', name: 'Celsius', symbol: '°C', min: -273.15 },
    K: { key: 'K', name: 'Kelvin', symbol: 'K', min: 0 },
    F: { key: 'F', name: 'Fahrenheit', symbol: '°F', min: -459.67 },
    R: { key: 'R', name: 'Rankine', symbol: '°R', min: 0 }
  };

  // Zonas térmicas (en °C) y rango visual del termómetro
  const ZONE_COLD_MAX = 10;
  const ZONE_MILD_MAX = 30;
  const THERMO_MIN = -50;
  const THERMO_MAX = 150;

  // Número decimal con un solo separador (punto o coma) y exponente opcional
  const NUMBER_PATTERN = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;
  const NON_FINITE_PATTERN = /^[+-]?(?:infinity|inf|nan)$/i;

  function fail(code, message) {
    return { ok: false, code: code, message: message };
  }

  /** Convierte texto de usuario en número. Acepta coma o punto decimal. */
  function parseInput(text) {
    const s = String(text === null || text === undefined ? '' : text)
      .trim()
      .replace(/\u2212/g, '-'); // signo menos tipográfico → guion
    if (s === '') {
      return fail('empty', 'Ingresa un valor numérico para convertir.');
    }
    if (NON_FINITE_PATTERN.test(s)) {
      return fail('infinite', 'El valor no es finito. Ingresa un número real que no se desborde a infinito.');
    }
    if (!NUMBER_PATTERN.test(s)) {
      return fail('format', 'El valor no es un número válido. Usa solo dígitos, un signo opcional y un solo separador decimal (coma o punto).');
    }
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n)) {
      return fail('infinite', 'El valor no es finito. Ingresa un número real que no se desborde a infinito.');
    }
    return { ok: true, value: n };
  }

  function assertScale(scale) {
    if (!Object.prototype.hasOwnProperty.call(SCALES, scale)) {
      throw new RangeError('Escala desconocida: ' + scale);
    }
  }

  /** Mínimo físico (cero absoluto) expresado en la escala indicada. */
  function minimum(scale) {
    assertScale(scale);
    return SCALES[scale].min;
  }

  /** true si el valor está por debajo del cero absoluto de su escala. */
  function isBelowAbsoluteZero(value, scale) {
    return value < minimum(scale) - EPS;
  }

  /** Escala → Celsius. Sin redondeo. */
  function toCelsius(v, scale) {
    assertScale(scale);
    switch (scale) {
      case 'C': return v;
      case 'K': return v - 273.15;
      case 'F': return (v - 32) * 5 / 9;
      default:  return v * 5 / 9 - 273.15; // 'R'
    }
  }

  /** Celsius → escala. Sin redondeo. */
  function fromCelsius(c, scale) {
    assertScale(scale);
    switch (scale) {
      case 'C': return c;
      case 'K': return c + 273.15;
      case 'F': return c * 9 / 5 + 32;
      default:  return (c + 273.15) * 9 / 5; // 'R'
    }
  }

  /** Ajusta al cero absoluto exacto si el ruido de flotante lo desvía <EPS; evita -0. */
  function snapToMinimum(value, scale) {
    if (Math.abs(value - SCALES[scale].min) <= EPS) return SCALES[scale].min;
    return value === 0 ? 0 : value;
  }

  /** Conversión pura vía Celsius. Misma escala → mismo valor. No redondea. */
  function convert(value, from, to) {
    assertScale(from);
    assertScale(to);
    if (from === to) return value;
    return snapToMinimum(fromCelsius(toCelsius(value, from), to), to);
  }

  /**
   * Redondeo para mostrar (mitad hacia arriba en magnitud), de 0 a 6 decimales.
   * Corrige casos como 1.005 → "1.01" que toFixed() resuelve mal por binario.
   */
  function formatNumber(value, decimals) {
    let d = Math.round(Number(decimals));
    if (!Number.isFinite(d)) d = 2;
    d = Math.min(6, Math.max(0, d));
    if (!Number.isFinite(value)) return String(value);

    const abs = Math.abs(value);
    const clean = Number(abs.toPrecision(15)); // elimina ruido binario residual
    const text = String(clean);
    let out;
    if (text.indexOf('e') === -1) {
      const shifted = Math.round(Number(text + 'e' + d));
      const back = Number(shifted + 'e-' + d);
      out = Number.isFinite(back) ? back.toFixed(d) : clean.toFixed(d);
    } else {
      out = clean.toFixed(d); // magnitudes extremas
    }
    if (value < 0 && /[1-9]/.test(out)) out = '-' + out; // nunca "-0.00"
    return out;
  }

  /** Representación compacta (12 cifras significativas) para fórmulas y pasos. */
  function trimNumber(n) {
    const x = Math.abs(n) < EPS ? 0 : n;
    return String(Number(x.toPrecision(12)));
  }

  /** Zona térmica según los grados Celsius. */
  function thermalZone(celsius) {
    if (celsius < ZONE_COLD_MAX) return 'cold';
    if (celsius <= ZONE_MILD_MAX) return 'mild';
    return 'hot';
  }

  /** Nivel del termómetro entre 0 y 1 (acotado al rango visual). */
  function thermometerLevel(celsius) {
    const t = (celsius - THERMO_MIN) / (THERMO_MAX - THERMO_MIN);
    return Math.min(1, Math.max(0, t));
  }

  // Fórmulas por escala (vía Celsius) con plantilla de sustitución
  const TO_C = {
    K: { formula: '°C = K − 273.15',          sub: function (v) { return v + ' − 273.15'; } },
    F: { formula: '°C = (°F − 32) × 5/9',     sub: function (v) { return '(' + v + ' − 32) × 5/9'; } },
    R: { formula: '°C = °R × 5/9 − 273.15',   sub: function (v) { return v + ' × 5/9 − 273.15'; } }
  };
  const FROM_C = {
    K: { formula: 'K = °C + 273.15',          sub: function (c) { return c + ' + 273.15'; } },
    F: { formula: '°F = °C × 9/5 + 32',       sub: function (c) { return c + ' × 9/5 + 32'; } },
    R: { formula: '°R = (°C + 273.15) × 9/5', sub: function (c) { return '(' + c + ' + 273.15) × 9/5'; } }
  };

  /**
   * Pasos de la conversión con los valores sustituidos.
   * Devuelve [{ title, formula, substituted }].
   */
  function describeSteps(value, from, to, decimals) {
    assertScale(from);
    assertScale(to);
    const v = trimNumber(value);
    const out = convert(value, from, to);

    if (from === to) {
      return [{
        title: 'Misma escala',
        formula: 'Origen y destino son ' + SCALES[from].name + ': el valor no cambia.',
        substituted: v + ' ' + SCALES[from].symbol + ' = ' + formatNumber(out, decimals) + ' ' + SCALES[to].symbol
      }];
    }

    const steps = [];
    const celsius = toCelsius(value, from);
    let cText = v;

    if (from !== 'C') {
      const f = TO_C[from];
      cText = trimNumber(celsius);
      const shown = to === 'C' ? formatNumber(out, decimals) : cText;
      steps.push({
        title: to === 'C' ? 'Conversión directa a Celsius' : 'Paso 1: pasar a Celsius',
        formula: f.formula,
        substituted: '°C = ' + f.sub(v) + ' = ' + shown
      });
    }
    if (to !== 'C') {
      const g = FROM_C[to];
      steps.push({
        title: from === 'C' ? 'Conversión directa' : 'Paso 2: pasar de Celsius a ' + SCALES[to].name,
        formula: g.formula,
        substituted: SCALES[to].symbol + ' = ' + g.sub(cText) + ' = ' + formatNumber(out, decimals)
      });
    }
    return steps;
  }

  /**
   * Valida y convierte a partir del texto del usuario.
   * Devuelve { ok:true, input, from, to, output, celsius } o { ok:false, code, message }.
   */
  function evaluate(text, from, to) {
    if (!Object.prototype.hasOwnProperty.call(SCALES, from) ||
        !Object.prototype.hasOwnProperty.call(SCALES, to)) {
      return fail('scale', 'Selecciona una escala de origen y una de destino.');
    }
    const parsed = parseInput(text);
    if (!parsed.ok) return parsed;

    if (isBelowAbsoluteZero(parsed.value, from)) {
      const s = SCALES[from];
      return fail('range',
        'El valor está por debajo del cero absoluto. El mínimo en ' + s.name + ' es ' + s.min + ' ' + s.symbol + '.');
    }

    const celsius = toCelsius(parsed.value, from);
    const output = convert(parsed.value, from, to);
    if (!Number.isFinite(celsius) || !Number.isFinite(output)) {
      return fail('overflow', 'El resultado excede el rango numérico representable. Ingresa un valor de menor magnitud.');
    }
    return { ok: true, input: parsed.value, from: from, to: to, output: output, celsius: celsius };
  }

  const TempCore = {
    SCALES: SCALES,
    EPS: EPS,
    parseInput: parseInput,
    minimum: minimum,
    isBelowAbsoluteZero: isBelowAbsoluteZero,
    toCelsius: toCelsius,
    fromCelsius: fromCelsius,
    convert: convert,
    formatNumber: formatNumber,
    trimNumber: trimNumber,
    thermalZone: thermalZone,
    thermometerLevel: thermometerLevel,
    describeSteps: describeSteps,
    evaluate: evaluate
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = TempCore; // Node (pruebas)
  } else {
    root.TempCore = TempCore;  // Navegador
  }

  /* =======================================================================
     PARTE 2 — INTERFAZ
     ======================================================================= */
  if (typeof document === 'undefined') return;

  const ZONE_NAMES = { cold: 'Frío', mild: 'Templado', hot: 'Caliente' };
  const HISTORY_LIMIT = 10;

  function initUI() {
    const $ = function (id) { return document.getElementById(id); };
    const el = {
      form: $('converter-form'), value: $('value-input'), sign: $('sign-btn'),
      from: $('from-scale'), to: $('to-scale'), swap: $('swap-btn'), decimals: $('decimals'),
      error: $('error-msg'), clear: $('clear-btn'),
      card: $('result-card'), context: $('result-context'), line: $('result-line'),
      value2: $('result-value'), unit: $('result-unit'), zone: $('zone-label'),
      copy: $('copy-btn'), copyLabel: $('copy-label'),
      thermoSvg: $('thermo-svg'), thermoFill: $('thermo-fill'), thermoNote: $('thermo-note'),
      formulaSummary: $('formula-summary'), formulaList: $('formula-list'),
      histList: $('history-list'), histEmpty: $('history-empty'), histClear: $('history-clear'),
      toast: $('toast'), status: $('sr-status'), theme: $('theme-toggle')
    };

    // Estado solo en memoria (sin localStorage)
    const state = { touched: false, current: null, history: [], toastTimer: null, copyTimer: null };

    /* ---------- Utilidades de interfaz ---------- */
    function announce(message) {
      // Vaciar primero asegura que lectores de pantalla repitan mensajes iguales
      el.status.textContent = '';
      window.setTimeout(function () { el.status.textContent = message; }, 30);
    }

    function showToast(message, kind) {
      window.clearTimeout(state.toastTimer);
      el.toast.textContent = message;
      el.toast.classList.add('show');
      state.toastTimer = window.setTimeout(function () {
        el.toast.classList.remove('show');
      }, kind === 'warn' ? 6000 : 2200);
    }

    function showError(message) {
      el.error.textContent = message;
      el.value.setAttribute('aria-invalid', 'true');
    }

    function clearError() {
      el.error.textContent = '';
      el.value.removeAttribute('aria-invalid');
    }

    /* ---------- Resultado ---------- */
    function setThermometer(level) {
      el.thermoFill.style.transform = 'scaleY(' + level + ')';
    }

    function resetResult() {
      state.current = null;
      el.card.setAttribute('data-zone', 'none');
      el.context.textContent = 'Ingresa un valor válido para ver la conversión.';
      el.value2.textContent = '—';
      el.unit.textContent = '';
      el.zone.textContent = 'Sin datos';
      el.copy.disabled = true;
      setThermometer(0);
      el.thermoSvg.setAttribute('aria-label', 'Termómetro sin datos');
      el.thermoNote.textContent = 'Escala de referencia: -50 a 150 °C.';
      el.formulaSummary.textContent = 'Todas las conversiones pasan primero por Celsius.';
      el.formulaList.textContent = '';
      const li = document.createElement('li');
      li.className = 'formula-empty';
      li.textContent = 'La fórmula con los valores sustituidos aparecerá aquí.';
      el.formulaList.appendChild(li);
    }

    function renderFormula(r, decimals) {
      const steps = TempCore.describeSteps(r.input, r.from, r.to, decimals);
      el.formulaSummary.textContent =
        SCALES[r.from].name + ' → ' + SCALES[r.to].name +
        (r.from !== r.to ? ' (vía Celsius, sin redondeos intermedios)' : '');
      el.formulaList.textContent = '';
      steps.forEach(function (s) {
        const li = document.createElement('li');
        const title = document.createElement('span');
        title.className = 'f-title';
        title.textContent = s.title;
        const formula = document.createElement('code');
        formula.textContent = s.formula;
        li.appendChild(title);
        li.appendChild(formula);
        if (s.substituted) {
          const sub = document.createElement('code');
          sub.className = 'f-sub';
          sub.textContent = s.substituted;
          li.appendChild(sub);
        }
        el.formulaList.appendChild(li);
      });
    }

    function renderResult(r, decimals) {
      const out = TempCore.formatNumber(r.output, decimals);
      const symFrom = SCALES[r.from].symbol;
      const symTo = SCALES[r.to].symbol;
      const zone = TempCore.thermalZone(r.celsius);
      const level = TempCore.thermometerLevel(r.celsius);
      const celsiusText = TempCore.formatNumber(r.celsius, decimals);
      const outside = r.celsius < -50 || r.celsius > 150;

      el.card.setAttribute('data-zone', zone);
      el.context.textContent = TempCore.trimNumber(r.input) + ' ' + symFrom + ' equivale a';
      el.value2.textContent = out;
      el.unit.textContent = symTo;
      el.zone.textContent = ZONE_NAMES[zone];
      el.copy.disabled = false;
      setThermometer(level);
      el.thermoSvg.setAttribute('aria-label',
        'Termómetro: zona ' + ZONE_NAMES[zone].toLowerCase() + ', ' + celsiusText + ' grados Celsius');
      el.thermoNote.textContent = outside
        ? celsiusText + ' °C queda fuera del rango del termómetro (-50 a 150 °C).'
        : 'Equivale a ' + celsiusText + ' °C. Rango: -50 a 150 °C.';
      renderFormula(r, decimals);

      state.current = {
        copyText: out + ' ' + symTo,
        spoken: TempCore.trimNumber(r.input) + ' ' + SCALES[r.from].name + ' equivale a ' + out + ' ' + SCALES[r.to].name,
        historyText: TempCore.trimNumber(r.input) + ' ' + symFrom + ' → ' + out + ' ' + symTo,
        key: [r.input, r.from, r.to, decimals].join('|')
      };
    }

    /* ---------- Historial ---------- */
    function renderHistory() {
      el.histList.textContent = '';
      state.history.forEach(function (h) {
        const li = document.createElement('li');
        const expr = document.createElement('span');
        expr.className = 'h-expr';
        expr.textContent = h.text;
        const time = document.createElement('span');
        time.className = 'h-time';
        time.textContent = h.time;
        li.appendChild(expr);
        li.appendChild(time);
        el.histList.appendChild(li);
      });
      const has = state.history.length > 0;
      el.histList.hidden = !has;
      el.histEmpty.hidden = has;
      el.histClear.disabled = !has;
    }

    function addHistory() {
      const cur = state.current;
      if (!cur) return;
      if (state.history.length && state.history[0].key === cur.key) return; // evita duplicados seguidos
      let time = '';
      try {
        time = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) {
        time = new Date().toTimeString().slice(0, 8);
      }
      state.history.unshift({ key: cur.key, text: cur.historyText, time: time });
      if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
      renderHistory();
    }

    /* ---------- Conversión ---------- */
    // Entradas parciales mientras se escribe: "-", ".", "1e", "-1e-"
    const INCOMPLETE = /^[+\-\u2212]?[.,]?$|^[+\-\u2212]?(?:\d+[.,]?\d*|[.,]\d+)[eE][+\-]?$/;

    function update(opts) {
      opts = opts || {};
      const raw = el.value.value;
      const decimals = Number(el.decimals.value);
      const trimmed = raw.trim();

      if (!opts.commit) {
        if (trimmed === '' && !state.touched) { clearError(); resetResult(); return null; }
        if (trimmed !== '' && INCOMPLETE.test(trimmed)) { clearError(); resetResult(); return null; }
      }

      const r = TempCore.evaluate(raw, el.from.value, el.to.value);
      if (!r.ok) {
        showError(r.message);
        resetResult();
        if (opts.announce) announce(r.message);
        return null;
      }
      clearError();
      renderResult(r, decimals);
      if (opts.commit) addHistory();
      if (opts.announce) announce('Resultado: ' + state.current.spoken + '.');
      return r;
    }

    /* ---------- Copiar ---------- */
    function legacyCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.setAttribute('aria-hidden', 'true');
      ta.className = 'offscreen';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    function selectResultManually() {
      try {
        const range = document.createRange();
        range.selectNodeContents(el.line);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) { /* sin selección posible */ }
      showToast('No se pudo copiar automáticamente. El resultado quedó seleccionado: presiona Ctrl+C (Cmd+C en Mac).', 'warn');
    }

    function copyDone() {
      window.clearTimeout(state.copyTimer);
      el.copyLabel.textContent = '¡Copiado!';
      state.copyTimer = window.setTimeout(function () { el.copyLabel.textContent = 'Copiar resultado'; }, 1800);
      showToast('Resultado copiado: ' + state.current.copyText);
      announce('Resultado copiado: ' + state.current.copyText);
    }

    function copyResult() {
      if (!state.current) return;
      const text = state.current.copyText;
      function fallback() {
        const ok = legacyCopy(text);
        el.copy.focus({ preventScroll: true });
        if (ok) copyDone(); else selectResultManually();
      }
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(copyDone, fallback);
      } else {
        fallback();
      }
    }

    /* ---------- Tema claro/oscuro ---------- */
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    let manualTheme = false;

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      el.theme.setAttribute('aria-pressed', String(theme === 'dark'));
    }

    applyTheme(mq && mq.matches ? 'dark' : 'light');
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', function (e) { if (!manualTheme) applyTheme(e.matches ? 'dark' : 'light'); });
    }
    el.theme.addEventListener('click', function () {
      manualTheme = true;
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    /* ---------- Eventos ---------- */
    el.value.addEventListener('input', function () { state.touched = true; update(); });
    el.value.addEventListener('change', function () { state.touched = true; update({ commit: true }); });
    el.from.addEventListener('change', function () { update(); });
    el.to.addEventListener('change', function () { update(); });
    el.decimals.addEventListener('change', function () { update(); });

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      state.touched = true;
      const r = update({ commit: true, announce: true });
      if (!r) el.value.focus();
    });

    el.swap.addEventListener('click', function () {
      const a = el.from.value;
      el.from.value = el.to.value;
      el.to.value = a;
      update({ announce: true });
    });

    el.sign.addEventListener('click', function () {
      state.touched = true;
      const t = el.value.value.trim();
      if (t === '') el.value.value = '-';
      else if (t.charAt(0) === '-' || t.charAt(0) === '\u2212') el.value.value = t.slice(1);
      else el.value.value = '-' + t.replace(/^\+/, '');
      el.value.focus();
      update();
    });

    el.clear.addEventListener('click', function () {
      el.value.value = '';
      state.touched = false;
      clearError();
      resetResult();
      announce('Campo de valor limpio.');
      el.value.focus();
    });

    el.copy.addEventListener('click', copyResult);

    el.histClear.addEventListener('click', function () {
      state.history = [];
      renderHistory();
      announce('Historial borrado.');
    });

    /* ---------- Estado inicial ---------- */
    renderHistory();
    resetResult();
    // El termómetro "sube" al cargar (la transición CSS respeta prefers-reduced-motion)
    window.requestAnimationFrame(function () { update(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})(typeof self !== 'undefined' ? self : this);
