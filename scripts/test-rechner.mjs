// Prueft den Ingenieur-Rechner (public/rechner-lib.js) gegen bekannte Norm- und Handbuchwerte.
// Aufruf: node scripts/test-rechner.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../public/rechner-lib.js");

let fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { fail++; console.error("FEHLER:", msg, "erwartet", e, "erhalten", a); } else console.log("ok:", msg);
}
function near(actual, expected, tolRel, msg) {
  if (!(Math.abs(actual - expected) <= Math.abs(expected) * tolRel)) { fail++; console.error("FEHLER:", msg, "erwartet ~", expected, "erhalten", actual); }
  else console.log("ok:", msg, "(" + actual.toFixed(3) + ")");
}
const S = (d, l, g) => { const x = R.shaftDeviation(d, l, g); return [x.es, x.ei]; };
const H = (d, l, g) => { const x = R.holeDeviation(d, l, g); return [x.ES, x.EI]; };

// ISO 286-2, Grenzabmasse in Mikrometer (Tabellenwerte)
eq(H(25, "H", 7), [21, 0], "H7 Ø25");
eq(S(25, "g", 6), [-7, -20], "g6 Ø25");
eq(S(25, "f", 7), [-20, -41], "f7 Ø25");
eq(S(25, "h", 6), [0, -13], "h6 Ø25");
eq(S(25, "k", 6), [15, 2], "k6 Ø25");
eq(S(25, "m", 6), [21, 8], "m6 Ø25");
eq(S(25, "n", 6), [28, 15], "n6 Ø25");
eq(S(25, "p", 6), [35, 22], "p6 Ø25");
eq(S(25, "js", 6), [6.5, -6.5], "js6 Ø25");
eq(S(25, "js", 7), [10, -10], "js7 Ø25 (IT 21 auf 20 gerundet)");
eq(S(40, "e", 8), [-50, -89], "e8 Ø40");
eq(H(50, "H", 7), [25, 0], "H7 Ø50 (Bereichsgrenze 30 bis 50)");
eq(H(50.1, "H", 7), [30, 0], "H7 Ø50,1");
eq(S(100, "k", 6), [25, 3], "k6 Ø100");
eq(S(100, "m", 6), [35, 13], "m6 Ø100");
eq(S(100, "p", 6), [59, 37], "p6 Ø100");
eq(H(10, "H", 8), [22, 0], "H8 Ø10");
eq(S(10, "f", 7), [-13, -28], "f7 Ø10");
eq(H(25, "K", 7), [6, -15], "K7 Ø25");
eq(H(25, "M", 7), [0, -21], "M7 Ø25");
eq(H(25, "N", 7), [-7, -28], "N7 Ø25");
eq(H(25, "P", 7), [-14, -35], "P7 Ø25");
eq(H(10, "N", 7), [-4, -19], "N7 Ø10");
eq(H(10, "K", 6), [2, -7], "K6 Ø10");
eq(H(25, "G", 7), [28, 7], "G7 Ø25");
eq(H(25, "F", 8), [53, 20], "F8 Ø25");
eq(H(2, "K", 7), [0, -10], "K7 Ø2");
eq(H(2, "N", 7), [-4, -14], "N7 Ø2");
eq(S(160, "h", 9), [0, -100], "h9 Ø160");

const f1 = R.fit(25, "H", 7, "g", 6);
eq([f1.maxClearance, f1.minClearance, f1.type], [41, 7, "Spielpassung"], "Passung H7/g6 Ø25");
const f2 = R.fit(25, "H", 7, "k", 6);
eq([f2.maxClearance, f2.minClearance, f2.type], [19, -15, "Übergangspassung"], "Passung H7/k6 Ø25");
const f3 = R.fit(25, "H", 7, "p", 6);
eq([f3.maxClearance, f3.minClearance, f3.type], [-1, -35, "Übermasspassung"], "Passung H7/p6 Ø25");
let threw = false; try { R.fit(600, "H", 7, "g", 6); } catch (e) { threw = true; }
eq(threw, true, "über 500 mm wird abgelehnt");

// Gewicht: Rundstahl Ø20 wiegt 2,466 kg/m, Rohr 60,3 x 2,9 rund 4,1 kg/m, Blech 1000 x 2000 x 3 = 47,1 kg
near(R.weight("rund", { d: 20 }, 1000, 7.85, 1).perPiece, 2.466, 0.002, "Rundstahl Ø20, 1 m");
near(R.weight("rohr", { D: 60.3, s: 2.9 }, 1000, 7.85, 1).perPiece, 4.11, 0.01, "Rohr 60,3 x 2,9, 1 m");
near(R.weight("rechteck", { b: 1000, h: 3 }, 2000, 7.85, 1).perPiece, 47.1, 0.001, "Blech 1000 x 2000 x 3");
near(R.weight("rechteck", { b: 1000, h: 3 }, 2000, 7.85, 5).total, 235.5, 0.001, "5 Bleche");
near(R.weight("sechskant", { s: 17 }, 1000, 7.85, 1).perPiece, 1.965, 0.005, "Sechskant SW17, 1 m");
near(R.weight("rechteckrohr", { b: 40, h: 40, s: 3 }, 1000, 7.85, 1).perPiece, 3.39, 0.03, "Quadratrohr 40 x 40 x 3, 1 m (scharfkantig)");

// Querschnitte
near(R.section("rechteck", { b: 10, h: 20 }).I, 6666.667, 1e-6, "I Rechteck 10 x 20");
near(R.section("rund", { d: 20 }).W, 785.398, 1e-5, "W Rundstab Ø20");

// Biegebalken: Kragarm 1 m, Rechteck 20 x 40, Stahl, 1000 N am Ende
const sec = R.section("rechteck", { b: 20, h: 40 });
const b1 = R.beam("krag-f", 1000, 1000, 210000, sec);
near(b1.M, 1e6, 1e-9, "Moment Kragarm");
near(b1.sigma, 187.5, 1e-9, "Spannung Kragarm (W = 5333 mm3)");
near(b1.f, 14.881, 1e-4, "Durchbiegung Kragarm");
const b2 = R.beam("feld-q", 2, 3000, 210000, R.section("rechteck", { b: 100, h: 200 }));
near(b2.f, 5 * 2 * 3000 ** 4 / (384 * 210000 * (100 * 200 ** 3 / 12)), 1e-9, "Einfeldträger Streckenlast");

// Schrauben: Vergleich mit VDI-2230-Tabellenwerten (SFS-Pruefbericht: M12 8.8, mu 0,12: 43,0 kN / 84 Nm;
// mu 0,08: 45,2 kN / 63 Nm. Bossard: M12 8.8, mu 0,14: 41,9 kN / 93 Nm)
const m8 = R.bolt("M8", "8.8", 0.12);
near(m8.As, 36.6, 0.01, "Spannungsquerschnitt M8");
near(m8.MA, 25, 0.08, "Anziehdrehmoment M8 8.8");
near(R.bolt("M10", "8.8", 0.12).MA, 49, 0.08, "Anziehdrehmoment M10 8.8");
near(R.bolt("M12", "8.8", 0.12).FM / 1000, 43.0, 0.02, "Vorspannkraft M12 8.8, mu 0,12");
near(R.bolt("M12", "8.8", 0.12).MA, 84, 0.04, "Anziehdrehmoment M12 8.8, mu 0,12");
near(R.bolt("M12", "8.8", 0.08).FM / 1000, 45.2, 0.02, "Vorspannkraft M12 8.8, mu 0,08");
near(R.bolt("M12", "8.8", 0.08).MA, 63, 0.04, "Anziehdrehmoment M12 8.8, mu 0,08");
near(R.bolt("M12", "8.8", 0.14).FM / 1000, 41.9, 0.02, "Vorspannkraft M12 8.8, mu 0,14");
near(R.bolt("M12", "8.8", 0.14).MA, 93, 0.04, "Anziehdrehmoment M12 8.8, mu 0,14");
near(R.bolt("M12", "10.9", 0.12).MA, 125, 0.08, "Anziehdrehmoment M12 10.9");
near(R.bolt("M16", "8.8", 0.12).As, 157, 0.01, "Spannungsquerschnitt M16");

// Einheiten
near(R.convert("druck", 1, "bar", "psi"), 14.5038, 1e-4, "1 bar in psi");
near(R.convert("laenge", 1, "Zoll (in)", "mm"), 25.4, 1e-12, "1 Zoll in mm");
near(R.convert("moment", 100, "Nm", "lbf·ft"), 73.756, 1e-4, "100 Nm in lbf·ft");
near(R.convert("temperatur", 100, "°C", "°F"), 212, 1e-12, "100 °C in °F");
near(R.convert("temperatur", 0, "°C", "K"), 273.15, 1e-12, "0 °C in K");

// Normprofile: Widerstandsmoment muss zu Flaechenmoment und Hoehe passen (W = 2 I / h), faengt Tippfehler
for (const series of Object.keys(R.PROFILES)) {
  for (const size of Object.keys(R.PROFILES[series])) {
    const pr = R.profile(series, size);
    const w = 2 * pr.I / pr.h;
    if (Math.abs(w - pr.W) / pr.W > 0.03) { fail++; console.error('FEHLER: Profil', series, size, 'W', pr.W, 'aus I/h', w.toFixed(0)); }
    const aMin = 2 * pr.b * 4; // grobe Untergrenze Flansche
    if (pr.A < aMin) { fail++; console.error('FEHLER: Profil', series, size, 'Flaeche unplausibel', pr.A); }
  }
}
console.log('ok: Normprofile in sich stimmig');
near(R.weight('profil', { series: 'IPE', size: 200 }, 6000, 7.85, 1).perPiece, 134.4, 0.002, 'IPE 200, 6 m');
near(R.section('profil', { series: 'HEB', size: 200 }).I, 56960000, 1e-9, 'I HEB 200');

// Elektronik
const o = R.ohm({ U: 12, I: 2 });
eq([o.R, o.P], [6, 24], 'Ohm: 12 V, 2 A');
near(R.ohm({ R: 100, P: 0.25 }).U, 5, 1e-9, 'Ohm: 100 Ohm, 0,25 W');
let t2 = false; try { R.ohm({ U: 1, I: 1, R: 1 }); } catch (e) { t2 = true; }
eq(t2, true, 'Ohm: drei Werte werden abgelehnt');
const led = R.ledResistor(12, 2, 20, 1);
eq([led.R, led.Rnorm], [500, 510], 'LED-Vorwiderstand 12 V, 2 V, 20 mA');
near(led.Inorm, 19.61, 1e-3, 'LED-Strom mit 510 Ohm');
eq(R.eSeries(4.8, 'E12'), 4.7, 'E12 naechster Wert zu 4,8');
eq(R.eSeries(1020, 'E24'), 1000, 'E24 naechster Wert zu 1020');
eq(R.eSeries(97, 'E24', 'up'), 100, 'E24 naechst groesser zu 97');
near(R.divider(12, 10000, 10000).Uout, 6, 1e-12, 'Spannungsteiler 1:1');
near(R.dividerR2(12, 3.3, 10000).R2, 3793.1, 1e-4, 'Spannungsteiler R2 fuer 3,3 V');
eq(R.colorCode(['braun', 'schwarz', 'rot', 'gold']), { R: 1000, tol: 5 }, 'Farbcode 1 kOhm');
eq(R.colorCode(['gelb', 'violett', 'orange', 'gold']), { R: 47000, tol: 5 }, 'Farbcode 47 kOhm');
eq(R.colorCode(['braun', 'schwarz', 'schwarz', 'braun', 'braun']), { R: 1000, tol: 1 }, 'Farbcode 5 Ringe');
near(R.voltageDrop(20, 10, 1.5, 230, 'kupfer').dU, 4.6667, 1e-4, 'Spannungsfall 20 m, 10 A, 1,5 mm2');
eq(R.minCross(20, 10, 230, 3, 'kupfer').Anorm, 1.5, 'Mindestquerschnitt 3 % (1,01 mm2 -> 1,5 mm2)');
near(R.rc(10000, 1e-6).fg, 15.915, 1e-4, 'RC-Grenzfrequenz 10 kOhm, 1 uF');

// Werkstatt
near(R.rpm(25, 10), 795.8, 1e-4, 'Drehzahl vc 25, d 10');
eq(R.THREADS.M8[0], 6.8, 'Kernloch M8');

console.log(fail ? fail + " Fehler" : "Ingenieur-Rechner: alle Pruefungen bestanden");
process.exit(fail ? 1 : 0);
