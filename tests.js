/* Pruebas de la lógica de conversión. Ejecutar con: node tests.js
   No requiere dependencias. Devuelve código de salida 1 si algo falla. */
'use strict';

const T = require('./script.js');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  OK   ' + name);
  } else {
    failed++;
    console.log('  FALLA ' + name + (detail ? '  → ' + detail : ''));
  }
}

const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const SC = ['C', 'K', 'F', 'R'];

/* 1. Puntos de referencia en las 4 escalas, todas las direcciones */
console.log('\n[1] Puntos de referencia (todas las direcciones)');
const refs = [
  { label: '0 °C',       v: { C: 0,       K: 273.15, F: 32,      R: 491.67 } },
  { label: '100 °C',     v: { C: 100,     K: 373.15, F: 212,     R: 671.67 } },
  { label: 'cero abs.',  v: { C: -273.15, K: 0,      F: -459.67, R: 0 } }
];
refs.forEach(function (ref) {
  SC.forEach(function (from) {
    SC.forEach(function (to) {
      const got = T.convert(ref.v[from], from, to);
      check(ref.label + ': ' + from + ' → ' + to + ' = ' + ref.v[to], near(got, ref.v[to]), 'obtenido ' + got);
    });
  });
});

/* 2. Cero absoluto exacto (sin ruido de flotante) */
console.log('\n[2] Cero absoluto exacto desde cualquier escala');
check('-459.67 °F → K es exactamente 0', T.convert(-459.67, 'F', 'K') === 0, String(T.convert(-459.67, 'F', 'K')));
check('-459.67 °F → °R es exactamente 0', T.convert(-459.67, 'F', 'R') === 0, String(T.convert(-459.67, 'F', 'R')));
check('0 °R → °C es exactamente -273.15', T.convert(0, 'R', 'C') === -273.15, String(T.convert(0, 'R', 'C')));
check('0 K → °F es -459.67', near(T.convert(0, 'K', 'F'), -459.67), String(T.convert(0, 'K', 'F')));
check('0 °R → K es exactamente 0 (sin -0)', Object.is(T.convert(0, 'R', 'K'), 0));

/* 3. Validación del límite físico */
console.log('\n[3] Límite físico');
[['-273.15', 'C'], ['0', 'K'], ['-459.67', 'F'], ['0', 'R']].forEach(function (c) {
  const r = T.evaluate(c[0], c[1], 'K');
  check('válido: ' + c[0] + ' ' + c[1], r.ok === true, JSON.stringify(r));
});
[['-273.16', 'C', '-273.15 °C'], ['-0.01', 'K', '0 K'], ['-459.68', 'F', '-459.67 °F'], ['-0.01', 'R', '0 °R']].forEach(function (c) {
  const r = T.evaluate(c[0], c[1], 'C');
  check('rechazado: ' + c[0] + ' ' + c[1], r.ok === false && r.code === 'range', JSON.stringify(r));
  check('  mensaje indica el mínimo ' + c[2], r.ok === false && r.message.indexOf(c[2]) !== -1, r.message);
});

/* 4. Origen = destino */
console.log('\n[4] Origen = destino');
SC.forEach(function (s) {
  const v = 12.345;
  const r = T.evaluate('12.345', s, s);
  check(s + ' → ' + s + ' devuelve el mismo valor', r.ok && r.output === v, JSON.stringify(r));
});

/* 5. Entradas inválidas y formatos decimales */
console.log('\n[5] Entradas');
const bad = [
  ['', 'empty'], ['   ', 'empty'], ['abc', 'format'], ['12abc', 'format'], ['1e999', 'infinite'],
  ['Infinity', 'infinite'], ['-Infinity', 'infinite'], ['NaN', 'infinite'], ['1,234.5', 'format'],
  ['1.2.3', 'format'], ['0x10', 'format'], ['--5', 'format'], ['1 000', 'format']
];
bad.forEach(function (b) {
  const r = T.evaluate(b[0], 'C', 'F');
  check('"' + b[0] + '" → ' + b[1], r.ok === false && r.code === b[1], JSON.stringify(r));
});
const good = [['12,5', 12.5], ['12.5', 12.5], ['-40', -40], ['\u221240', -40], ['+5', 5], ['.5', 0.5], ['5.', 5], ['1e3', 1000], ['  7  ', 7]];
good.forEach(function (g) {
  const r = T.parseInput(g[0]);
  check('"' + g[0] + '" = ' + g[1], r.ok && r.value === g[1], JSON.stringify(r));
});
check('desbordamiento: 1e308 °C → °F se rechaza sin romper',
  (function () { const r = T.evaluate('1e308', 'C', 'F'); return r.ok === false && r.code === 'overflow'; })());
check('escala inválida no rompe', T.evaluate('1', 'X', 'C').ok === false);

/* 6. Formato y redondeo solo al mostrar */
console.log('\n[6] Formato');
const fmt = [
  [77, 2, '77.00'], [1 / 3, 6, '0.333333'], [1.005, 2, '1.01'], [2.675, 2, '2.68'], [-1.005, 2, '-1.01'],
  [0.5, 0, '1'], [-0.4, 0, '0'], [-1e-14, 2, '0.00'], [1e-7, 2, '0.00'], [100, 0, '100'],
  [-40, 2, '-40.00'], [273.15, 6, '273.150000'], [12.3456789, 3, '12.346'], [99.5, 0, '100']
];
fmt.forEach(function (f) {
  const got = T.formatNumber(f[0], f[1]);
  check('formatNumber(' + f[0] + ', ' + f[1] + ') = ' + f[2], got === f[2], 'obtenido ' + got);
});
check('decimales fuera de rango se acotan (9 → 6)', T.formatNumber(1 / 3, 9) === '0.333333');
check('decimales fuera de rango se acotan (-2 → 0)', T.formatNumber(2.4, -2) === '2');
check('sin acumulación de error: 36.6 °C → °F = 97.88', T.formatNumber(T.convert(36.6, 'C', 'F'), 2) === '97.88');
check('ida y vuelta °C → °R → °C conserva el valor', near(T.convert(T.convert(36.6, 'C', 'R'), 'R', 'C'), 36.6, 1e-12));

/* 7. Zonas y termómetro */
console.log('\n[7] Zonas y termómetro');
check('5 °C es frío', T.thermalZone(5) === 'cold');
check('10 °C es templado', T.thermalZone(10) === 'mild');
check('30 °C es templado', T.thermalZone(30) === 'mild');
check('30.1 °C es caliente', T.thermalZone(30.1) === 'hot');
check('nivel en -50 °C = 0', T.thermometerLevel(-50) === 0);
check('nivel en 150 °C = 1', T.thermometerLevel(150) === 1);
check('nivel en 50 °C = 0.5', T.thermometerLevel(50) === 0.5);
check('nivel se acota (-273.15 → 0, 1000 → 1)', T.thermometerLevel(-273.15) === 0 && T.thermometerLevel(1000) === 1);

/* 8. Fórmula con valores sustituidos */
console.log('\n[8] Pasos de la fórmula');
const s1 = T.describeSteps(25, 'C', 'F', 2);
check('25 °C → °F: un paso con la sustitución correcta',
  s1.length === 1 && s1[0].substituted === '°F = 25 × 9/5 + 32 = 77.00', JSON.stringify(s1));
const s2 = T.describeSteps(77, 'F', 'K', 2);
check('77 °F → K: dos pasos vía Celsius',
  s2.length === 2 && s2[0].substituted === '°C = (77 − 32) × 5/9 = 25' && s2[1].substituted === 'K = 25 + 273.15 = 298.15', JSON.stringify(s2));
const s3 = T.describeSteps(300, 'K', 'C', 1);
check('300 K → °C: conversión directa', s3.length === 1 && s3[0].substituted === '°C = 300 − 273.15 = 26.9', JSON.stringify(s3));
const s4 = T.describeSteps(5, 'R', 'R', 2);
check('misma escala: un paso informativo', s4.length === 1 && s4[0].title === 'Misma escala');
const s5 = T.describeSteps(491.67, 'R', 'C', 2);
check('491.67 °R → °C sin ruido en el paso (= 0.00)', s5[0].substituted === '°C = 491.67 × 5/9 − 273.15 = 0.00', JSON.stringify(s5));

console.log('\nResumen: ' + passed + ' pruebas correctas, ' + failed + ' con fallas.');
process.exit(failed === 0 ? 0 : 1);
