// CAD-Viewer des Kundenportals (/viewer). Liest STEP, IGES, STL und OBJ im Browser, die Datei verlaesst
// den Rechner nicht (STEP und IGES uebersetzt occt-import-js als WebAssembly). Kommentare und Freigaben
// speichert der Worker (src/cad.js), alles andere passiert lokal. Alle Texte aus Dateinamen und
// Kommentaren werden mit textContent eingesetzt.
import * as THREE from 'three';
import { OrbitControls } from '/vendor/three/OrbitControls.js';
import { STLLoader } from '/vendor/three/STLLoader.js';
import { OBJLoader } from '/vendor/three/OBJLoader.js';

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
const fmt = (n, d = 1) => n.toLocaleString('de-CH', { minimumFractionDigits: d, maximumFractionDigits: d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Szene
const stage = $('vStage');
const canvas = $('vCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100000);
camera.position.set(120, 90, 160);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6878, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(1, 1.4, 1.1);
scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd2ff, 0.55);
fill.position.set(-1.2, 0.4, -0.8);
scene.add(fill);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.addEventListener('change', () => { requestRender(); scheduleOcclusion(); });

// CAD arbeitet mit Z nach oben, three.js mit Y nach oben: Modell einmal um die X-Achse drehen.
const root = new THREE.Group();
root.rotation.x = -Math.PI / 2;
scene.add(root);

const S = {
  fileKey: null, name: '', parts: [], mode: 'shaded', tool: 'orbit',
  box: new THREE.Box3(), size: 1, center: new THREE.Vector3(),
  cutAxis: 'off', cutFlip: false, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  measures: [], pendingMeasure: null, notes: [], pendingNote: null, selectedNote: null,
  me: { email: 'Sie', isAdmin: true }, server: false, grid: null, approvals: [],
};

// ---------------------------------------------------------------- Rendern auf Anforderung
let pending = false;
let anim = null;
function requestRender() {
  if (pending) return;
  pending = true;
  const run = () => { if (!pending) return; pending = false; render(); };
  (window.requestAnimationFrame || setTimeout)(run);
  setTimeout(run, 60);
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
new ResizeObserver(resize).observe(stage);

function render() {
  if (anim) {
    const t = Math.min(1, (performance.now() - anim.t0) / anim.dur);
    const k = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(anim.fromPos, anim.toPos, k);
    controls.target.lerpVectors(anim.fromTarget, anim.toTarget, k);
    if (t >= 1) { anim = null; scheduleOcclusion(); }
  }
  controls.update();
  renderer.render(scene, camera);
  updateOverlays();
  if (anim) requestRender();
}

function flyTo(pos, target, dur = 650) {
  anim = { t0: performance.now(), dur, fromPos: camera.position.clone(), toPos: pos.clone(), fromTarget: controls.target.clone(), toTarget: target.clone() };
  requestRender();
}

// ---------------------------------------------------------------- Laden
function hint(text, ms = 0) {
  const h = $('vHint');
  h.textContent = text || '';
  h.classList.toggle('show', !!text);
  if (ms) setTimeout(() => { if (h.textContent === text) h.classList.remove('show'); }, ms);
}
function loading(text, frac) {
  $('vLoad').hidden = text == null;
  if (text != null) $('vLoadText').textContent = text;
  if (frac != null) $('vProgBar').style.width = Math.round(frac * 100) + '%';
}

async function fetchBytes(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = 'Datei konnte nicht geladen werden (' + res.status + ').';
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    loading('Datei wird geladen', got / total * 0.6);
  }
  const all = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return all.buffer;
}

let occtPromise = null;
function loadOcct() {
  if (occtPromise) return occtPromise;
  occtPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/occt/occt-import-js.js';
    s.onload = () => window.occtimportjs({ locateFile: () => '/vendor/occt/occt-import-js.wasm' }).then(resolve, reject);
    s.onerror = () => reject(new Error('STEP-Leser konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
  return occtPromise;
}

const DEFAULT_COLOR = 0x9db2c7;

async function parseCad(name, buf) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'stl') {
    const g = new STLLoader().parse(buf);
    return [{ name: name.replace(/\.[^.]+$/, ''), geometry: g, color: null }];
  }
  if (ext === 'obj') {
    const grp = new OBJLoader().parse(new TextDecoder().decode(buf));
    const out = [];
    grp.traverse((o) => { if (o.isMesh) { const g = o.geometry; if (!g.attributes.normal) g.computeVertexNormals(); out.push({ name: o.name || 'Teil ' + (out.length + 1), geometry: g, color: null }); } });
    return out;
  }
  if (['step', 'stp', 'iges', 'igs', 'brep'].includes(ext)) {
    loading('STEP-Leser wird gestartet', 0.65);
    const occt = await loadOcct();
    loading('Geometrie wird berechnet', 0.75);
    await sleep(30);
    const bytes = new Uint8Array(buf);
    // Etwas gröberes Netz als die Voreinstellung: deutlich schneller, auf dem Bildschirm kein Unterschied
    const opts = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.003, angularDeflection: 0.5 };
    const res = ext === 'brep' ? occt.ReadBrepFile(bytes, opts) : (ext === 'iges' || ext === 'igs') ? occt.ReadIgesFile(bytes, opts) : occt.ReadStepFile(bytes, opts);
    if (!res || !res.success || !res.meshes || !res.meshes.length) throw new Error('Die Datei enthält keine lesbare Geometrie.');
    return res.meshes.map((m, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      if (m.index) g.setIndex(new THREE.Uint32BufferAttribute(m.index.array, 1));
      if (!m.attributes.normal) g.computeVertexNormals();
      const c = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : null;
      return { name: m.name || 'Teil ' + (i + 1), geometry: g, color: c };
    });
  }
  throw new Error('Dateityp .' + ext + ' wird nicht unterstützt.');
}

function clearModel() {
  for (const p of S.parts) {
    p.mesh.geometry.dispose(); p.mesh.material.dispose();
    p.back.material.dispose(); p.edges.geometry.dispose();
  }
  root.clear();
  S.parts = [];
  S.measures = [];
  S.pendingMeasure = null;
  S.notes = [];
  S.pendingNote = null;
  S.selectedNote = null;
  S.approvals = [];
  overlays.length = 0;
  clear($('vOverlay'));
  if (S.grid) { scene.remove(S.grid); S.grid.geometry.dispose(); S.grid = null; }
  setTool('orbit');
  setCut('off');
}

function buildModel(name, partsData) {
  clearModel();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x0e151c, transparent: true, opacity: 0.85 });
  partsData.forEach((pd, i) => {
    const color = pd.color && (pd.color.r + pd.color.g + pd.color.b) < 2.9 ? pd.color : new THREE.Color(DEFAULT_COLOR);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.28, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(pd.geometry, mat);
    const back = new THREE.Mesh(pd.geometry, new THREE.MeshBasicMaterial({ color: 0xe0a030, side: THREE.BackSide }));
    back.visible = false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(pd.geometry, 32), lineMat.clone());
    edges.visible = false;
    root.add(back, mesh, edges);
    S.parts.push({ name: pd.name, color, mesh, back, edges, visible: true });
  });

  // Masse und Kennzahlen im CAD-Koordinatensystem (vor der Drehung)
  S.box = new THREE.Box3();
  for (const p of S.parts) { p.mesh.geometry.computeBoundingBox(); S.box.union(p.mesh.geometry.boundingBox); }
  const size = S.box.getSize(new THREE.Vector3());
  S.size = Math.max(size.x, size.y, size.z) || 1;
  S.center = S.box.getCenter(new THREE.Vector3());
  computeMetrics(size);

  // Raster unter dem Modell (Welt-Y ist CAD-Z)
  const worldBox = new THREE.Box3().setFromObject(root);
  const gridSize = Math.pow(10, Math.ceil(Math.log10(S.size * 2.2)));
  S.grid = new THREE.GridHelper(gridSize, 20, 0x6d7f91, 0x6d7f91);
  S.grid.material.transparent = true;
  S.grid.material.opacity = 0.28;
  S.grid.position.set((worldBox.min.x + worldBox.max.x) / 2, worldBox.min.y - S.size * 0.002, (worldBox.min.z + worldBox.max.z) / 2);
  S.grid.visible = $('vGrid').checked;
  scene.add(S.grid);

  S.name = name;
  $('vFile').textContent = name;
  $('vDrop').classList.add('hide');
  document.title = name + ' — CAD-Viewer';
  camera.near = S.size / 500;
  camera.far = S.size * 200;
  camera.updateProjectionMatrix();
  controls.maxDistance = S.size * 40;
  renderParts();
  applyMode();
  setView('iso', false);
  renderMeasures();
  renderNotes();
  requestRender();
}

function computeMetrics(size) {
  let vol = 0, area = 0, tris = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (const p of S.parts) {
    const g = p.mesh.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const n = idx ? idx.count / 3 : pos.count / 3;
    tris += n;
    for (let i = 0; i < n; i++) {
      const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      vol += a.dot(ab.crossVectors(b, c)) / 6;
      area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
    }
  }
  S.volume = Math.abs(vol);
  S.area = area;
  $('mDims').textContent = fmt(size.x) + ' × ' + fmt(size.y) + ' × ' + fmt(size.z) + ' mm';
  $('mVol').textContent = S.volume >= 1e6 ? fmt(S.volume / 1e6, 3) + ' dm³' : fmt(S.volume / 1000, 2) + ' cm³';
  $('mArea').textContent = fmt(S.area / 100, 1) + ' cm²';
  $('mTris').textContent = Math.round(tris).toLocaleString('de-CH');
  updateMass();
}
function updateMass() {
  if (S.volume == null) return;
  const rho = Number($('mMat').value);
  const g = S.volume / 1000 * rho;
  $('mMass').textContent = g >= 1000 ? fmt(g / 1000, 2) + ' kg' : fmt(g, 1) + ' g';
}
$('mMat').addEventListener('change', updateMass);

function renderParts() {
  const ul = $('vParts');
  clear(ul);
  $('vPartsSec').hidden = S.parts.length < 2;
  $('vPartCount').textContent = S.parts.length > 1 ? String(S.parts.length) : '';
  S.parts.forEach((p) => {
    const li = el('li');
    const lab = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = p.visible;
    cb.addEventListener('change', () => { p.visible = cb.checked; applyMode(); requestRender(); });
    const sw = el('span', 'sw');
    sw.style.background = '#' + p.color.getHexString();
    lab.append(cb, sw, document.createTextNode(p.name));
    li.appendChild(lab);
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------- Darstellung, Ansichten, Schnitt
function applyMode() {
  const clip = S.cutAxis !== 'off';
  for (const p of S.parts) {
    const m = p.mesh.material;
    m.wireframe = S.mode === 'wire';
    m.transparent = S.mode === 'xray';
    m.opacity = S.mode === 'xray' ? 0.22 : 1;
    m.depthWrite = S.mode !== 'xray';
    m.side = clip ? THREE.FrontSide : THREE.DoubleSide;
    m.clippingPlanes = clip ? [S.plane] : [];
    m.needsUpdate = true;
    p.mesh.visible = p.visible;
    p.edges.visible = p.visible && (S.mode === 'edges' || S.mode === 'xray');
    p.edges.material.clippingPlanes = clip ? [S.plane] : [];
    p.back.visible = p.visible && clip && S.mode !== 'wire' && S.mode !== 'xray';
    p.back.material.clippingPlanes = clip ? [S.plane] : [];
  }
}
$('vMode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  S.mode = b.dataset.mode;
  [...$('vMode').children].forEach((x) => x.classList.toggle('active', x === b));
  applyMode();
  requestRender();
});
$('vGrid').addEventListener('change', () => { if (S.grid) S.grid.visible = $('vGrid').checked; requestRender(); });

const VIEWS = { iso: [1, 0.8, 1], front: [0, 0, 1], top: [0.0001, 1, 0.0001], right: [1, 0, 0] };
function setView(name, animate = true) {
  if (!S.parts.length) return;
  const wb = new THREE.Box3().setFromObject(root);
  const c = wb.getCenter(new THREE.Vector3());
  const dist = S.size / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.55;
  const dir = new THREE.Vector3(...(VIEWS[name] || VIEWS.iso)).normalize();
  const pos = c.clone().addScaledVector(dir, dist);
  if (animate) flyTo(pos, c); else { camera.position.copy(pos); controls.target.copy(c); controls.update(); requestRender(); }
  [...document.querySelectorAll('.vtools button')].forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}
document.querySelector('.vtools').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) setView(b.dataset.view === 'fit' ? 'iso' : b.dataset.view);
});

const AXES = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };
// Welche Seite standardmaessig stehen bleibt, damit die Schnittflaeche aus der Iso-Ansicht sichtbar ist
const KEEP = { x: -1, y: 1, z: -1 };
function updatePlane() {
  if (S.cutAxis === 'off') return;
  const n = new THREE.Vector3(...AXES[S.cutAxis]);
  const wb = new THREE.Box3().setFromObject(root);
  let min = Infinity, max = -Infinity;
  for (const x of [wb.min.x, wb.max.x]) for (const y of [wb.min.y, wb.max.y]) for (const z of [wb.min.z, wb.max.z]) {
    const d = n.x * x + n.y * y + n.z * z;
    min = Math.min(min, d); max = Math.max(max, d);
  }
  const t = Number($('vCutPos').value) / 1000;
  const d = min + t * (max - min);
  const nn = n.clone().multiplyScalar(KEEP[S.cutAxis] * (S.cutFlip ? -1 : 1));
  S.plane.setFromNormalAndCoplanarPoint(nn, n.clone().multiplyScalar(d));
}
function setCut(axis) {
  S.cutAxis = axis;
  [...$('vCutAxis').children].forEach((b) => b.classList.toggle('active', b.dataset.axis === axis));
  $('vCutPos').disabled = axis === 'off';
  $('vCutFlip').disabled = axis === 'off';
  updatePlane();
  applyMode();
  requestRender();
}
$('vCutAxis').addEventListener('click', (e) => { const b = e.target.closest('button[data-axis]'); if (b) setCut(b.dataset.axis); });
$('vCutPos').addEventListener('input', () => { updatePlane(); requestRender(); });
$('vCutFlip').addEventListener('change', () => { S.cutFlip = $('vCutFlip').checked; updatePlane(); requestRender(); });

// ---------------------------------------------------------------- Markierungen im Raum
const overlays = [];
const ray = new THREE.Raycaster();
const tmp = new THREE.Vector3();

function addOverlay(node, local, extra) {
  $('vOverlay').appendChild(node);
  const o = { node, local: local.clone(), ...extra };
  overlays.push(o);
  return o;
}
function removeOverlay(o) {
  o.node.remove();
  const i = overlays.indexOf(o);
  if (i >= 0) overlays.splice(i, 1);
}
function updateOverlays() {
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const o of overlays) {
    tmp.copy(o.local);
    root.localToWorld(tmp);
    tmp.project(camera);
    const behind = tmp.z > 1 || tmp.z < -1;
    o.node.classList.toggle('hidden', behind || (o.hideWith && !o.hideWith()));
    o.node.style.left = ((tmp.x * 0.5 + 0.5) * w) + 'px';
    o.node.style.top = ((-tmp.y * 0.5 + 0.5) * h) + 'px';
  }
}
let occTimer = null;
function scheduleOcclusion() {
  clearTimeout(occTimer);
  occTimer = setTimeout(updateOcclusion, 180);
}
function visibleMeshes() { return S.parts.filter((p) => p.visible).map((p) => p.mesh); }
function updateOcclusion() {
  const pins = overlays.filter((o) => o.kind === 'pin');
  if (!pins.length || pins.length > 80) return;
  const meshes = visibleMeshes();
  for (const o of pins) {
    const wp = root.localToWorld(o.local.clone());
    const dir = wp.clone().sub(camera.position);
    const dist = dir.length();
    ray.set(camera.position, dir.normalize());
    const hits = ray.intersectObjects(meshes, false).filter((x) => S.cutAxis === 'off' || S.plane.distanceToPoint(x.point) >= 0);
    o.node.classList.toggle('occluded', !!hits.length && hits[0].distance < dist - S.size * 0.012);
  }
}

// ---------------------------------------------------------------- Picken, Messen, Kommentieren
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(visibleMeshes(), false).filter((x) => S.cutAxis === 'off' || S.plane.distanceToPoint(x.point) >= 0);
  if (!hits.length) return null;
  const hit = hits[0];
  const local = root.worldToLocal(hit.point.clone());
  // Auf die naechste Ecke des getroffenen Dreiecks einrasten, wenn sie nahe genug liegt
  let snapped = false;
  if (hit.face) {
    const pos = hit.object.geometry.attributes.position;
    let best = null, bd = S.size * 0.03;
    for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const d = v.distanceTo(local);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) { local.copy(best); snapped = true; }
  }
  return { local, snapped };
}

let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 5 || S.tool === 'orbit' || !S.parts.length) return;
  const p = pick(e);
  if (!p) return;
  if (S.tool === 'measure') onMeasurePoint(p.local);
  else if (S.tool === 'comment') onCommentPoint(p.local);
});

function setTool(tool) {
  S.tool = S.tool === tool ? 'orbit' : tool;
  stage.classList.toggle('measure', S.tool === 'measure');
  stage.classList.toggle('comment', S.tool === 'comment');
  $('vMeasure').classList.toggle('on', S.tool === 'measure');
  $('vNoteTool').classList.toggle('on', S.tool === 'comment');
  if (S.pendingMeasure) { removeOverlay(S.pendingMeasure.marker); S.pendingMeasure = null; }
  if (S.tool !== 'comment') cancelNote();
  hint(S.tool === 'measure' ? 'Klicken Sie zwei Punkte am Modell an. Ecken rasten automatisch ein.' : S.tool === 'comment' ? 'Klicken Sie die Stelle an, zu der Sie etwas anmerken möchten.' : '');
  requestRender();
}
$('vMeasure').addEventListener('click', () => setTool('measure'));
$('vNoteTool').addEventListener('click', () => setTool('comment'));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.tool !== 'orbit') setTool(S.tool); });

// Linie und Punkte im Modellraum zeichnen
function makeMarker(local, color = 0xe0a030) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(S.size * 0.008, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  m.position.copy(local);
  m.renderOrder = 20;
  root.add(m);
  return m;
}
function onMeasurePoint(local) {
  if (!S.pendingMeasure) {
    const dot = el('div', 'vlabel', 'A');
    const marker = addOverlay(dot, local, { kind: 'dot' });
    S.pendingMeasure = { a: local.clone(), marker, mesh: makeMarker(local) };
    return;
  }
  const a = S.pendingMeasure.a, b = local.clone();
  removeOverlay(S.pendingMeasure.marker);
  root.remove(S.pendingMeasure.mesh);
  S.pendingMeasure = null;
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe0a030, depthTest: false }));
  line.renderOrder = 19;
  const ma = makeMarker(a), mb = makeMarker(b);
  root.add(line);
  const d = a.distanceTo(b);
  const label = el('div', 'vlabel', fmt(d, 2) + ' mm');
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const ov = addOverlay(label, mid, { kind: 'label' });
  S.measures.push({ a, b, d, line, ma, mb, ov });
  renderMeasures();
  requestRender();
}
function renderMeasures() {
  const ul = $('vMeasList');
  clear(ul);
  S.measures.forEach((m, i) => {
    const li = el('li');
    const head = el('div', 'vm-head');
    head.append(el('span', '', 'Abstand ' + (i + 1)), el('span', '', fmt(m.d, 2) + ' mm'));
    const dx = Math.abs(m.b.x - m.a.x), dy = Math.abs(m.b.y - m.a.y), dz = Math.abs(m.b.z - m.a.z);
    li.append(head, el('div', 'vm-sub', 'ΔX ' + fmt(dx, 2) + '  ΔY ' + fmt(dy, 2) + '  ΔZ ' + fmt(dz, 2)));
    ul.appendChild(li);
  });
}
$('vMeasureClear').addEventListener('click', () => {
  for (const m of S.measures) { root.remove(m.line, m.ma, m.mb); removeOverlay(m.ov); }
  S.measures = [];
  renderMeasures();
  requestRender();
});

// ---------------------------------------------------------------- Kommentare
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Fehler ' + res.status);
  return j;
}
function viewState() {
  return { pos: camera.position.toArray(), target: controls.target.toArray() };
}
function onCommentPoint(local) {
  cancelNote();
  const n = S.notes.length + 1;
  const pin = el('div', 'vpin', '+');
  const o = addOverlay(pin, local, { kind: 'pin-temp' });
  S.pendingNote = { local: local.clone(), view: viewState(), overlay: o };
  $('vNoteForm').hidden = false;
  $('vNoteText').value = '';
  $('vNoteText').focus();
  requestRender();
}
function cancelNote() {
  if (S.pendingNote) { removeOverlay(S.pendingNote.overlay); S.pendingNote = null; }
  $('vNoteForm').hidden = true;
}
$('vNoteCancel').addEventListener('click', cancelNote);
$('vNoteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!S.pendingNote) return;
  const text = $('vNoteText').value.trim();
  if (text.length < 2) return;
  const p = S.pendingNote;
  const payload = { text, point: p.local.toArray(), view: p.view };
  try {
    let note;
    if (S.server) {
      note = (await api('/api/cad/note', { method: 'POST', body: JSON.stringify({ key: S.fileKey, ...payload }) })).note;
    } else {
      note = { id: 'lokal-' + Date.now(), author: 'Sie', text, point: payload.point, view: payload.view, createdAt: new Date().toISOString(), status: 'offen' };
    }
    S.notes.push(note);
    cancelNote();
    S.selectedNote = note.id;
    renderNotes();
  } catch (err) {
    hint(err.message, 4000);
  }
});

function noteOverlays() {
  for (const o of overlays.filter((x) => x.kind === 'pin')) removeOverlay(o);
  S.notes.forEach((n, i) => {
    const pin = el('div', 'vpin' + (n.status === 'erledigt' ? ' done' : '') + (n.id === S.selectedNote ? ' sel' : ''), String(i + 1));
    pin.title = n.text.slice(0, 80);
    pin.addEventListener('click', () => selectNote(n.id, true));
    addOverlay(pin, new THREE.Vector3(...n.point), { kind: 'pin', noteId: n.id });
  });
  scheduleOcclusion();
}
function selectNote(id, fly) {
  S.selectedNote = id;
  const n = S.notes.find((x) => x.id === id);
  renderNotes();
  if (fly && n && n.view) flyTo(new THREE.Vector3(...n.view.pos), new THREE.Vector3(...n.view.target));
}
function renderNotes() {
  const ul = $('vNotes');
  clear(ul);
  $('vNoteCount').textContent = S.notes.length ? String(S.notes.length) : '';
  S.notes.forEach((n, i) => {
    const li = el('li', (n.status === 'erledigt' ? 'done ' : '') + (n.id === S.selectedNote ? 'sel' : ''));
    const head = el('div', 'vm-head');
    const left = el('span', '', '');
    left.append(el('span', 'vnote-n', String(i + 1)), document.createTextNode(' ' + (n.author || '')));
    head.append(left, el('span', 'vm-sub', new Date(n.createdAt).toLocaleDateString('de-CH')));
    li.append(head, el('div', 'vnote-t', n.text));
    const act = el('div', 'vnote-actions');
    const done = el('button', '', n.status === 'erledigt' ? 'Wieder öffnen' : 'Erledigt');
    done.addEventListener('click', async (e) => {
      e.stopPropagation();
      const to = n.status === 'erledigt' ? 'offen' : 'erledigt';
      try {
        if (S.server) await api('/api/cad/note-status', { method: 'POST', body: JSON.stringify({ key: S.fileKey, id: n.id, status: to }) });
        n.status = to;
        renderNotes();
      } catch (err) { hint(err.message, 4000); }
    });
    act.appendChild(done);
    if (!S.server || S.me.isAdmin || (n.author || '') === (S.me.email || '').toLowerCase()) {
      const del = el('button', 'del', 'Löschen');
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Diesen Kommentar löschen?')) return;
        try {
          if (S.server) await api('/api/cad/note?key=' + encodeURIComponent(S.fileKey) + '&id=' + encodeURIComponent(n.id), { method: 'DELETE' });
          S.notes = S.notes.filter((x) => x.id !== n.id);
          renderNotes();
        } catch (err) { hint(err.message, 4000); }
      });
      act.appendChild(del);
    }
    li.appendChild(act);
    li.addEventListener('click', () => selectNote(n.id, true));
    ul.appendChild(li);
  });
  $('vNoteInfo').textContent = S.server ? '' : 'Dieses Modell liegt nicht im Portal. Kommentare gelten nur für diese Sitzung und werden nicht gespeichert.';
  noteOverlays();
  requestRender();
}

// ---------------------------------------------------------------- Freigabe
function renderApproval(state) {
  const box = $('vApproval');
  const ul = $('vApprovals');
  clear(ul);
  box.className = 'vapproval';
  clear(box);
  const a = state && state.approval;
  if (!a) {
    box.textContent = 'Noch nicht freigegeben.';
  } else {
    const stale = !a.unknown && !a.current;
    box.classList.add(stale ? 'stale' : 'ok');
    box.appendChild(el('b', '', stale ? 'Datei seit der Freigabe geändert' : 'Freigegeben'));
    box.appendChild(document.createTextNode(a.by + ', ' + new Date(a.at).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })));
    if (a.comment) box.appendChild(el('div', 'vsmall', a.comment));
    if (stale) box.appendChild(el('div', 'vsmall', 'Die gespeicherte Datei ist nicht mehr dieselbe wie bei der Freigabe. Bitte erneut prüfen und freigeben.'));
    else if (a.unknown) box.appendChild(el('div', 'vsmall', 'Ob die Datei seit der Freigabe geändert wurde, lässt sich nicht feststellen.'));
    else if (a.sha256) box.appendChild(el('div', 'vsmall', 'Prüfsumme ' + a.sha256.slice(0, 16) + '…'));
  }
  const all = (state && state.approvals) || [];
  if (all.length > 1) {
    all.slice(0, -1).reverse().forEach((x) => {
      const li = el('li');
      li.append(el('div', 'vm-head', x.by), el('div', 'vm-sub', new Date(x.at).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) + ' (frühere Freigabe)'));
      ul.appendChild(li);
    });
  }
  $('vApproveInfo').textContent = S.server ? 'Die Freigabe wird mit Name, Zeitpunkt und Prüfsumme der Datei festgehalten.' : 'Freigaben sind nur für Dateien im Kundenportal möglich.';
  $('vApprove').disabled = !S.server;
}
$('vApprove').addEventListener('click', async () => {
  if (!S.server) return;
  if (!confirm('Mit der Freigabe bestätigen Sie die aktuelle Fassung dieser Datei. Fortfahren?')) return;
  const comment = window.prompt('Anmerkung zur Freigabe (optional):', '') || '';
  try {
    await api('/api/cad/approve', { method: 'POST', body: JSON.stringify({ key: S.fileKey, comment }) });
    await loadServerState();
    hint('Freigabe gespeichert.', 3000);
  } catch (err) { hint(err.message, 5000); }
});

async function loadServerState() {
  try {
    const st = await api('/api/cad/state?key=' + encodeURIComponent(S.fileKey));
    S.notes = st.notes || [];
    S.me = st.me || S.me;
    S.approvals = st.approvals || [];
    renderNotes();
    renderApproval(st);
  } catch (err) {
    hint('Kommentare konnten nicht geladen werden: ' + err.message, 6000);
    renderApproval(null);
  }
}

// ---------------------------------------------------------------- Dateien oeffnen
async function openBuffer(name, buf, fileKey) {
  try {
    loading('Modell wird aufgebaut', 0.9);
    await sleep(20);
    const parts = await parseCad(name, buf);
    buildModel(name, parts);
    S.fileKey = fileKey || null;
    S.server = !!fileKey;
    $('vApproveSec').hidden = false;
    if (S.server) await loadServerState(); else { renderNotes(); renderApproval(null); }
    loading(null);
  } catch (err) {
    loading(null);
    hint(err.message || 'Die Datei konnte nicht gelesen werden.', 8000);
    console.error(err);
  }
}
async function openFile(file) {
  loading('Datei wird gelesen', 0.3);
  const buf = await file.arrayBuffer();
  await openBuffer(file.name, buf, null);
}
$('vOpen').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
['dragenter', 'dragover'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.remove('dragover'); }));
stage.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f); });

// Beispielmodell: Flansch mit Nabe, damit sich alles ohne eigene Datei zeigen laesst (Millimeter, Z oben)
function demoParts() {
  const plate = new THREE.Shape();
  plate.absarc(0, 0, 60, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, 20, 0, Math.PI * 2, true);
  plate.holes.push(bore);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * 42, Math.sin(a) * 42, 5.5, 0, Math.PI * 2, true);
    plate.holes.push(h);
  }
  const g1 = new THREE.ExtrudeGeometry(plate, { depth: 12, bevelEnabled: false, curveSegments: 64 });
  const hub = new THREE.Shape();
  hub.absarc(0, 0, 30, 0, Math.PI * 2, false);
  const hb = new THREE.Path();
  hb.absarc(0, 0, 20, 0, Math.PI * 2, true);
  hub.holes.push(hb);
  const g2 = new THREE.ExtrudeGeometry(hub, { depth: 30, bevelEnabled: false, curveSegments: 64 });
  g2.translate(0, 0, 12);
  return [
    { name: 'Flansch-Platte', geometry: g1, color: new THREE.Color(0x8fa6bd) },
    { name: 'Nabe', geometry: g2, color: new THREE.Color(0xc9a25a) },
  ];
}
$('vDemo').addEventListener('click', async () => {
  loading('Beispielmodell wird aufgebaut', 0.8);
  await sleep(20);
  buildModel('Beispiel-Flansch (Demo)', demoParts());
  S.fileKey = null; S.server = false;
  renderNotes(); renderApproval(null);
  loading(null);
});

$('vShot').addEventListener('click', () => {
  if (!S.parts.length) return;
  renderer.render(scene, camera);
  canvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = (S.name || $('vFile').textContent || 'modell').replace(/\.[^.]+$/, '') + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
});

// ---------------------------------------------------------------- Start
(async function start() {
  resize();
  renderApproval(null);
  const params = new URLSearchParams(location.search);
  const k = params.get('key');
  if (params.get('demo')) { $('vDemo').click(); return; }
  if (!k) return;
  S.name = k.split('/').pop();
  try {
    loading('Datei wird geladen', 0.05);
    const buf = await fetchBytes('/api/download?key=' + encodeURIComponent(k));
    await openBuffer(S.name, buf, k);
  } catch (err) {
    loading(null);
    hint(err.message, 10000);
  }
})();

// Fuer Tests im Browser
window.__viewer = { openBuffer, S, camera, controls, root, requestRender, setView, setCut, setTool, onMeasurePoint, buildModel, demoParts };
