// Rechenfunktionen des Ingenieur-Rechners (/rechner). Reine Funktionen ohne Seitenbezug, damit sie
// sich mit `node scripts/test-rechner.mjs` gegen bekannte Normwerte pruefen lassen.
// Einheiten: Laengen in mm, Kraefte in N, Spannungen in N/mm2 (= MPa), Toleranzen in Mikrometer.
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ ISO 286 (Passungen)
  // Nennmassbereiche "ueber ... bis ..." in mm (bis 500 mm)
  var RANGES = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
  // Grundtoleranzen IT in Mikrometer, ISO 286-1 Tabelle 1
  var IT = {
    4: [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20],
    5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
    6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
    7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
    8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
    9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
    10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
    11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400]
  };
  // Grundabmasse der Wellen in Mikrometer: es fuer e, f, g, h (oberes Abmass), ei fuer k, m, n, p (unteres Abmass)
  var SHAFT = {
    e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
    f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
    g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
    h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5], // gilt fuer IT4 bis IT7, sonst 0
    m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
    n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
    p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68]
  };
  var GRADES = { hole: [6, 7, 8, 9, 10, 11], shaft: [5, 6, 7, 8, 9, 10, 11] };
  // Angebotene Kurzzeichen und zulaessige Grade (die gebraeuchlichen Reihen)
  var HOLE_LETTERS = { E: [8, 9], F: [6, 7, 8], G: [6, 7], H: [6, 7, 8, 9, 10, 11], JS: [6, 7, 8, 9], K: [6, 7, 8], M: [6, 7, 8], N: [6, 7, 8], P: [6, 7] };
  var SHAFT_LETTERS = { e: [7, 8, 9], f: [6, 7, 8], g: [5, 6], h: [5, 6, 7, 8, 9, 10, 11], js: [5, 6, 7, 8, 9], k: [5, 6, 7], m: [5, 6, 7], n: [5, 6, 7], p: [5, 6] };

  function rangeIndex(d) {
    if (!(d > 0) || d > 500) return -1;
    for (var i = 0; i < RANGES.length; i++) if (d <= RANGES[i]) return i;
    return -1;
  }
  function rangeLabel(i) {
    return (i === 0 ? 'bis 3' : 'über ' + RANGES[i - 1] + ' bis ' + RANGES[i]) + ' mm';
  }
  function jsHalf(it, grade) {
    // ISO 286: bei IT7 bis IT11 wird ein ungerader IT-Wert auf den naechst kleineren geraden gerundet
    if (grade >= 7 && it % 2 === 1) it -= 1;
    return it / 2;
  }

  // Grenzabmasse einer Welle, z.B. shaftDeviation(25, 'g', 6) -> { es: -7, ei: -20 }
  function shaftDeviation(d, letter, grade) {
    var i = rangeIndex(d);
    if (i < 0) throw new Error('Nennmass muss zwischen 0 und 500 mm liegen.');
    if (!SHAFT_LETTERS[letter] || SHAFT_LETTERS[letter].indexOf(grade) < 0) throw new Error('Toleranzklasse ' + letter + grade + ' wird nicht unterstuetzt.');
    var it = IT[grade][i];
    if (letter === 'js') { var h = jsHalf(it, grade); return { es: h, ei: -h, it: it, range: rangeLabel(i) }; }
    if ('efgh'.indexOf(letter) >= 0) { var es = SHAFT[letter][i]; return { es: es, ei: es - it, it: it, range: rangeLabel(i) }; }
    var ei = SHAFT[letter][i];
    if (letter === 'k' && (grade < 4 || grade > 7)) ei = 0;
    return { es: ei + it, ei: ei, it: it, range: rangeLabel(i) };
  }

  // Grenzabmasse einer Bohrung, z.B. holeDeviation(25, 'H', 7) -> { ES: 21, EI: 0 }
  function holeDeviation(d, letter, grade) {
    var i = rangeIndex(d);
    if (i < 0) throw new Error('Nennmass muss zwischen 0 und 500 mm liegen.');
    if (!HOLE_LETTERS[letter] || HOLE_LETTERS[letter].indexOf(grade) < 0) throw new Error('Toleranzklasse ' + letter + grade + ' wird nicht unterstuetzt.');
    var it = IT[grade][i];
    var r = rangeLabel(i);
    if (letter === 'JS') { var h = jsHalf(it, grade); return { ES: h, EI: -h, it: it, range: r }; }
    if ('EFGH'.indexOf(letter) >= 0) { var EI = 0 - SHAFT[letter.toLowerCase()][i]; return { ES: EI + it, EI: EI, it: it, range: r }; }
    // K, M, N, P: ES = -ei + Delta, Delta = IT(n) - IT(n-1), gilt fuer K, M, N bis IT8 und P bis IT7, nicht bis 3 mm
    var ei = SHAFT[letter.toLowerCase()][i];
    var delta = i === 0 ? 0 : IT[grade][i] - IT[grade - 1][i];
    var ES;
    if (letter === 'K') ES = i === 0 ? 0 : -ei + delta;
    else ES = -ei + delta;
    return { ES: ES, EI: ES - it, it: it, range: r };
  }

  // Passung, z.B. fit(25, 'H', 7, 'g', 6)
  function fit(d, hl, hg, sl, sg) {
    var H = holeDeviation(d, hl, hg), S = shaftDeviation(d, sl, sg);
    var maxClear = H.ES - S.ei; // groesstes Spiel (negativ: kleinstes Uebermass)
    var minClear = H.EI - S.es; // kleinstes Spiel (negativ: groesstes Uebermass)
    var type = minClear >= 0 ? 'Spielpassung' : maxClear <= 0 ? 'Übermasspassung' : 'Übergangspassung';
    return {
      hole: H, shaft: S, maxClearance: maxClear, minClearance: minClear, type: type,
      holeMax: d + H.ES / 1000, holeMin: d + H.EI / 1000, shaftMax: d + S.es / 1000, shaftMin: d + S.ei / 1000
    };
  }

  // ------------------------------------------------------------------ Werkstoffe
  var MATERIALS = {
    stahl: { name: 'Stahl (S235, S355, C45)', rho: 7.85, E: 210000 },
    edelstahl: { name: 'Edelstahl 1.4301 / 1.4404', rho: 7.95, E: 200000 },
    alu: { name: 'Aluminium (EN AW-6082)', rho: 2.70, E: 70000 },
    messing: { name: 'Messing CuZn39Pb3', rho: 8.47, E: 97000 },
    kupfer: { name: 'Kupfer', rho: 8.93, E: 120000 },
    titan: { name: 'Titan Grade 5', rho: 4.43, E: 114000 },
    guss: { name: 'Grauguss EN-GJL-250', rho: 7.20, E: 110000 },
    pom: { name: 'POM', rho: 1.41, E: 2800 },
    pa6: { name: 'PA6', rho: 1.14, E: 1500 },
    holz: { name: 'Holz (Fichte, längs)', rho: 0.47, E: 11000 }
  };

  // ------------------------------------------------------------------ Querschnitte (mm)
  // Liefert Flaeche A (mm2), Flaechenmoment I (mm4) um die waagrechte Achse und Widerstandsmoment W (mm3)
  function section(shape, p) {
    var PI = Math.PI;
    function pos() { for (var k = 0; k < arguments.length; k++) if (!(arguments[k] > 0)) throw new Error('Bitte alle Masse grösser als 0 eingeben.'); }
    if (shape === 'rund') { pos(p.d); return { A: PI * p.d * p.d / 4, I: PI * Math.pow(p.d, 4) / 64, W: PI * Math.pow(p.d, 3) / 32 }; }
    if (shape === 'rohr') {
      pos(p.D, p.s); var di = p.D - 2 * p.s; if (di < 0) throw new Error('Die Wandstärke ist zu gross.');
      var I = PI * (Math.pow(p.D, 4) - Math.pow(di, 4)) / 64; return { A: PI * (p.D * p.D - di * di) / 4, I: I, W: I / (p.D / 2) };
    }
    if (shape === 'rechteck') { pos(p.b, p.h); return { A: p.b * p.h, I: p.b * Math.pow(p.h, 3) / 12, W: p.b * p.h * p.h / 6 }; }
    if (shape === 'rechteckrohr') {
      pos(p.b, p.h, p.s); var bi = p.b - 2 * p.s, hi = p.h - 2 * p.s; if (bi < 0 || hi < 0) throw new Error('Die Wandstärke ist zu gross.');
      var I2 = (p.b * Math.pow(p.h, 3) - bi * Math.pow(hi, 3)) / 12; return { A: p.b * p.h - bi * hi, I: I2, W: I2 / (p.h / 2) };
    }
    if (shape === 'sechskant') { pos(p.s); var a = p.s / Math.sqrt(3); return { A: Math.sqrt(3) / 2 * p.s * p.s, I: 5 * Math.sqrt(3) / 16 * Math.pow(a, 4), W: 5 * Math.sqrt(3) / 16 * Math.pow(a, 4) / a }; }
    throw new Error('Unbekannter Querschnitt.');
  }

  // Gewicht: Laenge in mm, Dichte in g/cm3 -> kg
  function weight(shape, p, lengthMm, rho, count) {
    if (!(lengthMm > 0)) throw new Error('Bitte eine Länge grösser als 0 eingeben.');
    var A = section(shape, p).A; // mm2
    var kg = A * lengthMm * rho / 1e6; // mm3 * g/cm3 = 1e-3 g -> /1e6 kg
    var n = count > 0 ? Math.round(count) : 1;
    return { area: A, perPiece: kg, perMeter: A * 1000 * rho / 1e6, total: kg * n, count: n };
  }

  // ------------------------------------------------------------------ Biegebalken
  // fall: 'krag-f' Kragarm Einzellast am Ende, 'krag-q' Kragarm Streckenlast,
  //       'feld-f' Einfeldtraeger Einzellast in der Mitte, 'feld-q' Einfeldtraeger Streckenlast
  // F in N, q in N/mm (= kN/m), L in mm, E in N/mm2
  function beam(fall, load, L, E, sec) {
    if (!(L > 0) || !(E > 0) || !(load > 0)) throw new Error('Bitte Last, Länge und E-Modul grösser als 0 eingeben.');
    var M, f;
    if (fall === 'krag-f') { M = load * L; f = load * Math.pow(L, 3) / (3 * E * sec.I); }
    else if (fall === 'krag-q') { M = load * L * L / 2; f = load * Math.pow(L, 4) / (8 * E * sec.I); }
    else if (fall === 'feld-f') { M = load * L / 4; f = load * Math.pow(L, 3) / (48 * E * sec.I); }
    else if (fall === 'feld-q') { M = load * L * L / 8; f = 5 * load * Math.pow(L, 4) / (384 * E * sec.I); }
    else throw new Error('Unbekannter Lastfall.');
    return { M: M, sigma: M / sec.W, f: f, ratio: L / f };
  }

  // ------------------------------------------------------------------ Schrauben (Regelgewinde, VDI 2230 vereinfacht)
  // P Steigung, s Schluesselweite (Kopfauflage), dh Durchgangsbohrung mittel (ISO 273)
  var BOLTS = {
    M3: { d: 3, P: 0.5, s: 5.5, dh: 3.4 }, M4: { d: 4, P: 0.7, s: 7, dh: 4.5 }, M5: { d: 5, P: 0.8, s: 8, dh: 5.5 },
    M6: { d: 6, P: 1, s: 10, dh: 6.6 }, M8: { d: 8, P: 1.25, s: 13, dh: 9 }, M10: { d: 10, P: 1.5, s: 16, dh: 11 },
    M12: { d: 12, P: 1.75, s: 18, dh: 13.5 }, M14: { d: 14, P: 2, s: 21, dh: 15.5 }, M16: { d: 16, P: 2, s: 24, dh: 17.5 },
    M20: { d: 20, P: 2.5, s: 30, dh: 22 }, M24: { d: 24, P: 3, s: 36, dh: 26 }, M30: { d: 30, P: 3.5, s: 46, dh: 33 }
  };
  // Mindest-Streckgrenze Rp0,2 nach ISO 898-1 (N/mm2)
  function rp02(cls, d) {
    if (cls === '8.8') return d <= 16 ? 640 : 660;
    if (cls === '10.9') return 940;
    if (cls === '12.9') return 1100;
    if (cls === 'A2-70' || cls === 'A4-70') return 450;
    if (cls === 'A2-80' || cls === 'A4-80') return 600;
    throw new Error('Unbekannte Festigkeitsklasse.');
  }
  // mu: Reibungszahl Gewinde und Kopf (gleich angenommen), nu: Ausnutzung der Streckgrenze (VDI 2230: 0,9)
  function bolt(size, cls, mu, nu) {
    var b = BOLTS[size];
    if (!b) throw new Error('Unbekannte Gewindegroesse.');
    if (!(mu > 0 && mu < 0.5)) throw new Error('Reibungszahl zwischen 0,04 und 0,3 eingeben.');
    nu = nu || 0.9;
    var d2 = b.d - 0.649519 * b.P, d3 = b.d - 1.226869 * b.P, d0 = (d2 + d3) / 2;
    var As = Math.PI / 4 * d0 * d0;
    var R = rp02(cls, b.d);
    var k = 1.5 * (d2 / d0) * (b.P / (Math.PI * d2) + 1.155 * mu);
    var sigmaM = nu * R / Math.sqrt(1 + 3 * k * k);
    var FM = As * sigmaM; // N
    var Dkm = (b.s + b.dh) / 2;
    var MA = FM * (0.16 * b.P + 0.58 * d2 * mu + mu * Dkm / 2) / 1000; // Nm
    return { As: As, Rp: R, FM: FM, MA: MA, d2: d2, d3: d3, P: b.P };
  }

  // ------------------------------------------------------------------ Einheiten
  var UNITS = {
    laenge: { label: 'Länge', units: { mm: 1, cm: 10, m: 1000, 'Zoll (in)': 25.4, 'Fuss (ft)': 304.8, 'µm': 0.001 } },
    kraft: { label: 'Kraft', units: { N: 1, kN: 1000, 'kgf': 9.80665, 'lbf': 4.4482216 } },
    druck: { label: 'Druck und Spannung', units: { 'bar': 0.1, 'MPa = N/mm²': 1, 'kPa': 0.001, 'Pa': 1e-6, 'psi': 0.0068947573, 'ksi': 6.8947573, 'kgf/cm²': 0.0980665 } },
    moment: { label: 'Drehmoment', units: { 'Nm': 1, 'Ncm': 0.01, 'kNm': 1000, 'lbf·ft': 1.3558179, 'lbf·in': 0.11298483 } },
    masse: { label: 'Masse', units: { kg: 1, g: 0.001, t: 1000, 'lb': 0.45359237, 'oz': 0.028349523 } },
    leistung: { label: 'Leistung', units: { W: 1, kW: 1000, 'PS': 735.49875, 'hp': 745.69987 } }
  };
  function convert(group, value, from, to) {
    if (group === 'temperatur') {
      var c = from === '°C' ? value : from === '°F' ? (value - 32) * 5 / 9 : value - 273.15;
      return to === '°C' ? c : to === '°F' ? c * 9 / 5 + 32 : c + 273.15;
    }
    var g = UNITS[group];
    if (!g || !(from in g.units) || !(to in g.units)) throw new Error('Unbekannte Einheit.');
    return value * g.units[from] / g.units[to];
  }

  var api = {
    RANGES: RANGES, IT: IT, HOLE_LETTERS: HOLE_LETTERS, SHAFT_LETTERS: SHAFT_LETTERS, GRADES: GRADES,
    rangeIndex: rangeIndex, shaftDeviation: shaftDeviation, holeDeviation: holeDeviation, fit: fit,
    MATERIALS: MATERIALS, section: section, weight: weight, beam: beam,
    BOLTS: BOLTS, rp02: rp02, bolt: bolt, UNITS: UNITS, convert: convert
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rechner = api;
})(this);
