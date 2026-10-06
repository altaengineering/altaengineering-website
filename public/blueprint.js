/* Blueprint-Hintergrund der Alta-Portale: eine technische Zeichnung statt Gitter.
   Zahnrad, Flansch mit Lochkreis, Wellenschnitt mit Schraffur, Winkel mit Radius, Bemassung und ein
   Schriftfeld, dazu ein Zeichnungsrahmen mit Zonenbuchstaben. Reines SVG, farbig ueber die Variablen
   --bp-line / --bp-accent / --bp-paper, ruhig und ohne Bewegung. Einbinden: <script src="/blueprint.js">. */
(function () {
  'use strict';

  var CSS = '' +
    '.bp-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;' +
    'background:' +
      'radial-gradient(1200px 700px at 78% 8%,var(--bp-glow-a,rgba(90,166,236,.16)),transparent 62%),' +
      'radial-gradient(900px 600px at 6% 96%,var(--bp-glow-b,rgba(255,176,32,.09)),transparent 66%),' +
      'var(--bp-paper,transparent)}' +
    '.bp-bg svg{position:absolute;inset:0;width:100%;height:100%;' +
    '-webkit-mask-image:radial-gradient(ellipse 62% 58% at 50% 42%,rgba(0,0,0,.18),#000 82%);' +
    'mask-image:radial-gradient(ellipse 62% 58% at 50% 42%,rgba(0,0,0,.18),#000 82%)}' +
    '.bp-bg .l{fill:none;stroke:var(--bp-line,rgba(127,196,255,.28));stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}' +
    '.bp-bg .t{fill:none;stroke:var(--bp-line,rgba(127,196,255,.28));stroke-width:.7;vector-effect:non-scaling-stroke}' +
    '.bp-bg .c{fill:none;stroke:var(--bp-accent,rgba(255,176,32,.34));stroke-width:.8;stroke-dasharray:14 4 2 4;vector-effect:non-scaling-stroke}' +
    '.bp-bg .d{fill:none;stroke:var(--bp-accent,rgba(255,176,32,.34));stroke-width:.8;vector-effect:non-scaling-stroke}' +
    '.bp-bg .h{fill:none;stroke:var(--bp-line,rgba(127,196,255,.28));stroke-width:.6;vector-effect:non-scaling-stroke}' +
    '.bp-bg text{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:11px;fill:var(--bp-text,rgba(160,210,255,.5));letter-spacing:.06em}' +
    '.bp-bg .arr{fill:var(--bp-accent,rgba(255,176,32,.34));stroke:none}' +
    ':where(:root){--bp-paper:#eaf2fb;--bp-line:rgba(31,78,140,.24);--bp-accent:rgba(204,134,0,.38);--bp-text:rgba(31,78,140,.50);--bp-glow-a:rgba(31,78,140,.10);--bp-glow-b:rgba(255,176,32,.12)}' +
    ':where(:root[data-theme="dark"]){--bp-paper:#0a1626;--bp-line:rgba(127,196,255,.26);--bp-accent:rgba(255,176,32,.38);--bp-text:rgba(160,210,255,.52);--bp-glow-a:rgba(91,155,240,.20);--bp-glow-b:rgba(255,176,32,.10)}' +
    '@media (prefers-color-scheme:dark){:where(:root:not([data-theme])){--bp-paper:#0a1626;--bp-line:rgba(127,196,255,.26);--bp-accent:rgba(255,176,32,.38);--bp-text:rgba(160,210,255,.52);--bp-glow-a:rgba(91,155,240,.20);--bp-glow-b:rgba(255,176,32,.10)}}' +
    '@media print{.bp-bg{display:none}}';

  function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function f(n) { return Math.round(n * 10) / 10; }
  function P(pt) { return f(pt[0]) + ' ' + f(pt[1]); }

  // Zahnrad als Pfad: n Zaehne, Kopfkreis ro, Fusskreis ri.
  function gear(cx, cy, n, ro, ri) {
    var d = '', step = (Math.PI * 2) / n, i, a, pts;
    for (i = 0; i < n; i++) {
      a = i * step;
      pts = [
        polar(cx, cy, ri, a), polar(cx, cy, ri, a + step * 0.12),
        polar(cx, cy, ro, a + step * 0.26), polar(cx, cy, ro, a + step * 0.5),
        polar(cx, cy, ri, a + step * 0.64), polar(cx, cy, ri, a + step * 0.98)
      ];
      d += (i === 0 ? 'M' : 'L') + P(pts[0]) + ' L' + P(pts[1]) + ' L' + P(pts[2]) + ' L' + P(pts[3]) + ' L' + P(pts[4]) + ' L' + P(pts[5]);
    }
    return d + 'Z';
  }

  function circle(cx, cy, r, cls) { return '<circle class="' + (cls || 'l') + '" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '"/>'; }
  function line(x1, y1, x2, y2, cls) { return '<line class="' + (cls || 'l') + '" x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '"/>'; }
  function text(x, y, s, anchor, rot) {
    return '<text x="' + f(x) + '" y="' + f(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + (rot ? ' transform="rotate(' + rot + ' ' + f(x) + ' ' + f(y) + ')"' : '') + '>' + s + '</text>';
  }
  function arrow(x, y, ang) {
    var a = [x, y], b = polar(x, y, 9, ang + 0.22), c = polar(x, y, 9, ang - 0.22);
    return '<path class="arr" d="M' + P(a) + ' L' + P(b) + ' L' + P(c) + 'Z"/>';
  }
  // Masslinie mit Pfeilen und Text
  function dimH(x1, x2, y, label, off) {
    return line(x1, y, x2, y, 'd') + arrow(x1, y, Math.PI) + arrow(x2, y, 0) +
      line(x1, y - 14, x1, y + 8, 'h') + line(x2, y - 14, x2, y + 8, 'h') + text((x1 + x2) / 2, y - 6 + (off || 0), label, 'middle');
  }
  function dimV(x, y1, y2, label) {
    return line(x, y1, x, y2, 'd') + arrow(x, y1, -Math.PI / 2) + arrow(x, y2, Math.PI / 2) +
      line(x - 14, y1, x + 8, y1, 'h') + line(x - 14, y2, x + 8, y2, 'h') + text(x - 8, (y1 + y2) / 2, label, 'middle', -90);
  }
  function hatch(x, y, w, h, gap) {
    var s = '', i, t;
    for (i = gap; i < w + h; i += gap) {
      var x1 = x + Math.min(i, w), y1 = y + (i > w ? i - w : 0), x2 = x + (i > h ? i - h : 0), y2 = y + Math.min(i, h);
      s += line(x1, y1, x2, y2, 'h');
    }
    return s;
  }

  function build() {
    var W = 1600, H = 1000, s = '';

    // ----- Zeichnungsrahmen mit Zonen -----
    s += '<rect class="l" x="26" y="26" width="' + (W - 52) + '" height="' + (H - 52) + '"/>';
    s += '<rect class="t" x="40" y="40" width="' + (W - 80) + '" height="' + (H - 80) + '"/>';
    var i, zx;
    for (i = 1; i <= 8; i++) {
      zx = 40 + ((W - 80) / 8) * (i - 0.5);
      s += text(zx, 35, String(i), 'middle') + text(zx, H - 29, String(i), 'middle');
      if (i < 8) { var xx = 40 + ((W - 80) / 8) * i; s += line(xx, 26, xx, 40, 't') + line(xx, H - 40, xx, H - 26, 't'); }
    }
    var letters = 'ABCDEF';
    for (i = 0; i < 6; i++) {
      var zy = 40 + ((H - 80) / 6) * (i + 0.5);
      s += text(33, zy + 4, letters[i], 'middle') + text(W - 33, zy + 4, letters[i], 'middle');
      if (i < 5) { var yy = 40 + ((H - 80) / 6) * (i + 1); s += line(26, yy, 40, yy, 't') + line(W - 40, yy, W - 26, yy, 't'); }
    }

    // ----- Zahnrad links unten -----
    var gx = 250, gy = 760;
    s += '<path class="l" d="' + gear(gx, gy, 22, 168, 148) + '"/>';
    s += circle(gx, gy, 118, 't') + circle(gx, gy, 52) + circle(gx, gy, 38, 't');
    s += '<path class="l" d="M' + (gx - 8) + ' ' + (gy - 38) + ' L' + (gx - 8) + ' ' + (gy - 46) + ' L' + (gx + 8) + ' ' + (gy - 46) + ' L' + (gx + 8) + ' ' + (gy - 38) + '"/>';
    for (i = 0; i < 6; i++) { var hp = polar(gx, gy, 85, (Math.PI / 3) * i + 0.3); s += circle(hp[0], hp[1], 14); }
    s += line(gx - 200, gy, gx + 200, gy, 'c') + line(gx, gy - 200, gx, gy + 200, 'c');
    s += circle(gx, gy, 148, 'c');
    s += line(gx + 168, gy, gx + 250, gy - 70, 'd') + line(gx + 250, gy - 70, gx + 330, gy - 70, 'd') + arrow(gx + 168, gy, Math.PI + 0.74);
    s += text(gx + 258, gy - 78, 'Z = 22 · m = 14');
    s += text(gx, gy + 214, 'Ø 336', 'middle');

    // ----- Flansch oben rechts -----
    var fx = 1290, fy = 250;
    s += circle(fx, fy, 150) + circle(fx, fy, 118, 't') + circle(fx, fy, 56) + circle(fx, fy, 40, 't');
    s += circle(fx, fy, 100, 'c');
    for (i = 0; i < 8; i++) { var bp = polar(fx, fy, 100, (Math.PI / 4) * i + Math.PI / 8); s += circle(bp[0], bp[1], 13); s += line(bp[0] - 18, bp[1], bp[0] + 18, bp[1], 'c'); s += line(bp[0], bp[1] - 18, bp[0], bp[1] + 18, 'c'); }
    s += line(fx - 190, fy, fx + 190, fy, 'c') + line(fx, fy - 190, fx, fy + 190, 'c');
    s += dimH(fx - 150, fx + 150, fy + 205, 'Ø 300');
    s += line(fx + 110, fy - 108, fx + 215, fy - 175, 'd') + arrow(fx + 110, fy - 108, Math.PI + 0.56) + text(fx + 150, fy - 183, '8× Ø 26');
    s += text(fx - 60, fy - 168, 'PCD 200');

    // ----- Wellenschnitt unten Mitte -----
    var sx = 640, sy = 790;
    s += '<rect class="l" x="' + sx + '" y="' + sy + '" width="360" height="104"/>';
    s += '<rect class="l" x="' + (sx + 360) + '" y="' + (sy + 22) + '" width="150" height="60"/>';
    s += '<rect class="l" x="' + (sx - 70) + '" y="' + (sy + 22) + '" width="70" height="60"/>';
    s += hatch(sx, sy, 104, 104, 11);
    s += line(sx, sy + 52, sx + 580, sy + 52, 'c');
    s += line(sx + 250, sy + 104, sx + 250, sy + 135, 'h');
    s += dimH(sx, sx + 360, sy + 128, '360');
    s += dimH(sx + 360, sx + 510, sy + 128, '150');
    s += dimV(sx - 100, sy, sy + 104, 'Ø 104 h7');
    s += '<path class="l" d="M' + (sx - 70) + ' ' + (sy + 22) + ' q-10 14 0 26 q10 14 0 34"/>';
    s += text(sx + 188, sy - 14, 'SCHNITT A–A', 'middle');
    s += line(sx + 140, sy - 8, sx + 238, sy - 8, 't');

    // ----- Winkel / Konsole rechts -----
    var kx = 1120, ky = 700;
    s += '<path class="l" d="M' + kx + ' ' + ky + ' L' + (kx + 300) + ' ' + ky + ' L' + (kx + 300) + ' ' + (ky + 40) + ' L' + (kx + 56) + ' ' + (ky + 40) + ' Q' + (kx + 40) + ' ' + (ky + 40) + ' ' + (kx + 40) + ' ' + (ky + 56) + ' L' + (kx + 40) + ' ' + (ky + 200) + ' L' + kx + ' ' + (ky + 200) + ' Z"/>';
    s += circle(kx + 20, ky + 150, 9) + circle(kx + 20, ky + 95, 9);
    s += circle(kx + 250, ky + 20, 9);
    s += line(kx + 20, ky + 80, kx + 20, ky + 170, 'c') + line(kx + 232, ky + 20, kx + 268, ky + 20, 'c');
    s += '<path class="d" d="M' + (kx + 120) + ' ' + (ky + 140) + ' A100 100 0 0 1 ' + (kx + 190) + ' ' + (ky + 70) + '"/>';
    s += line(kx + 120, ky + 140, kx + 220, ky + 140, 'h') + line(kx + 120, ky + 140, kx + 190, ky + 70, 'h');
    s += text(kx + 200, ky + 128, '45°');
    s += dimV(kx + 335, ky, ky + 200, '200');
    s += text(kx + 52, ky + 78, 'R8', 'start');
    s += dimH(kx, kx + 300, ky - 28, '300');

    // ----- Isometrischer Quader oben links -----
    var ox = 190, oy = 210, a = 90, ang = Math.PI / 6, dx = a * Math.cos(ang), dy = a * Math.sin(ang);
    function iso(x, y, z) { return [ox + (x - y) * dx, oy + (x + y) * dy - z * a]; }
    function ln3(p, q) { return '<line class="l" x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="' + f(q[0]) + '" y2="' + f(q[1]) + '"/>'; }
    var v = [[0,0,0],[1.4,0,0],[1.4,1,0],[0,1,0],[0,0,1],[1.4,0,1],[1.4,1,1],[0,1,1]].map(function (p) { return iso(p[0], p[1], p[2]); });
    [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6]].forEach(function (e) { s += ln3(v[e[0]], v[e[1]]); });
    s += '<line class="h" x1="' + f(v[3][0]) + '" y1="' + f(v[3][1]) + '" x2="' + f(v[7][0]) + '" y2="' + f(v[7][1]) + '"/>';
    s += '<path class="l" d="M' + P(iso(0.45, 0.2, 1)) + ' L' + P(iso(0.95, 0.2, 1)) + ' L' + P(iso(0.95, 0.8, 1)) + ' L' + P(iso(0.45, 0.8, 1)) + 'Z"/>';
    s += text(ox - 20, oy + 135, 'ISO 5456-3');

    // ----- Schriftfeld unten rechts -----
    var bx = W - 40 - 420, by = H - 40 - 100;
    s += '<rect class="l" x="' + bx + '" y="' + by + '" width="420" height="100"/>';
    s += line(bx, by + 38, bx + 420, by + 38, 'l') + line(bx, by + 69, bx + 420, by + 69, 't') + line(bx + 250, by, bx + 250, by + 100, 'l') + line(bx + 335, by + 38, bx + 335, by + 100, 't');
    s += text(bx + 12, by + 25, 'ALTA ENGINEERING AG') + text(bx + 262, by + 25, 'Dokumentenlenkung');
    s += text(bx + 12, by + 58, 'Blatt 1 / 1') + text(bx + 262, by + 58, 'M 1:2') + text(bx + 347, by + 58, 'Rev. A');
    s += text(bx + 12, by + 89, 'gez. alta · gepr. QM') + text(bx + 262, by + 89, 'ISO 9001') + text(bx + 347, by + 89, 'ALT-0001');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }

  function mount() {
    if (document.querySelector('.bp-bg')) return;
    var old = document.querySelector('.app-bg');
    if (old) old.remove();
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var el = document.createElement('div');
    el.className = 'bp-bg';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = build();
    document.body.insertBefore(el, document.body.firstChild);
  }

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
