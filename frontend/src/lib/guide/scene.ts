// 「活动指南」: the 3D building — floors stacked apart, the event's rooms coloured with numbered
// callouts, and the shortest routes from the starting point (through the stairs when needed).
// Ported almost line by line from the stand-alone draft (~/Desktop/Guidemap/活动指南图.html); the
// page around it (title, lists, editor) is React, and talks to this through the returned object.
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const, @typescript-eslint/ban-ts-comment */
// @ts-nocheck — the body is the draft's untyped code, kept as-is so it stays easy to compare with
// the draft; the types exported above are what the page relies on.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  BG, CX, CZ, ENTRIES, FONT, GAP, PALETTE, PLAN, ROUTE_COLOR, S, SELECTABLE, SHAFTS, SLAB,
  STAIR_LINKS, TYPE_STYLE, W3, centroid, level, wx, wz, type Pt,
} from './plan'

export interface CustomStart { name: string; floor: number; pos: Pt }
// id: kept by the backend for likes and stars (none until the event is saved with it).
export interface GuideActivity { id?: string | null; place: string; name: string; time: string; color?: string | null }
export interface GuideConfig {
  title: string
  subtitle: string
  start: string | CustomStart | null
  sign: string
  activities: GuideActivity[]
  // Dragged labels: an activity card by its room's name, the start / sign-in tag as '@start' /
  // '@sign'; the offset from the spot it points at, in map units across and down the screen.
  labels?: Record<string, [number, number]>
}
export type FloorMode = 'auto' | 'all' | 1 | 2 | 3
// Which labels the map shows: every room and place name plus the activity callouts ('all'), only
// the activity callouts ('acts'), or neither ('none'). Floor tags and the start / sign-in pins stay.
export type LabelMode = 'all' | 'acts' | 'none'
export interface GuideGroup { place: string; floor: number; acts: { i: number; name: string; time: string; color: string }[] }
export interface GuideHooks {
  // Pixels at each edge of the container covered by the page's own panels: the fit keeps clear of them.
  insets?: () => Partial<Record<'left' | 'right' | 'top' | 'bottom', number>>
  onChange?: (groups: GuideGroup[], missing: string[]) => void
  onFloorMode?: (mode: FloorMode) => void
  onRoomClick?: (room: { name: string; floor: number; selectable: boolean; editing: boolean; activities: string[] }) => void
  onPickStart?: (pick: { floor: number; pos: Pt; autoName: string }) => void
  onPickMiss?: () => void
  // An editor dragged a label (or double-clicked it back to its automatic place: null).
  onLabelMove?: (key: string, offset: [number, number] | null) => void
}
export type GuideScene = ReturnType<typeof createGuideScene>

export function createGuideScene(container: HTMLElement, hooks: GuideHooks = {}) {
let cfg: GuideConfig = {title: '', subtitle: '', start: null, sign: '', activities: []};
/* ================================================================
   三、场景
   ================================================================ */
const stage = container;
const labelsEl = document.createElement('div'); labelsEl.className = 'gd-labels';
const leadersEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leadersEl.setAttribute('class', 'gd-leaders');
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement); stage.appendChild(leadersEl); stage.appendChild(labelsEl);
const scene = new THREE.Scene();
renderer.setClearColor(BG, 1);   // 不用 scene.background：它会在每一遍渲染时强制清屏
const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 15; controls.maxDistance = 900;
controls.screenSpacePanning = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0xcac2b2, 0.78 * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI); sun.position.set(-30, 60, 45); scene.add(sun);
const fillL = new THREE.DirectionalLight(0xffffff, 0.18 * Math.PI); fillL.position.set(40, 25, -30); scene.add(fillL);

const lineMat = new THREE.LineBasicMaterial({color: 0x7d786e, transparent: true, opacity: 0.55});
const lineMatGhost = new THREE.LineBasicMaterial({color: 0x7d786e, transparent: true, opacity: 0.22});
const slabTop = new THREE.MeshLambertMaterial({color: 0xfdfcf9});
const slabSide = new THREE.MeshLambertMaterial({color: 0xd3cdc1});
const ghostTop = new THREE.MeshLambertMaterial({color: 0xfdfcf9, transparent: true, opacity: 0.5, depthWrite: false});
const ghostSide = new THREE.MeshLambertMaterial({color: 0xd3cdc1, transparent: true, opacity: 0.35, depthWrite: false});

function makeShape(pts) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => i ? s.lineTo(wx(p), -wz(p)) : s.moveTo(wx(p), -wz(p)));
  return s;
}
function extrude(pts, h, holes) {
  const s = makeShape(pts);
  (holes || []).forEach(hp => {
    const path = new THREE.Path();
    hp.forEach((p, i) => i ? path.lineTo(wx(p), -wz(p)) : path.moveTo(wx(p), -wz(p)));
    s.holes.push(path);
  });
  const g = new THREE.ExtrudeGeometry(s, {depth: h, bevelEnabled: false});
  g.rotateX(-Math.PI / 2);
  return g;
}

const floors = {};          // f -> {group, routeGroup, ...}
const rooms = [];           // 所有房间
const roomByName = {};      // 可选地点
const stairs = {};          // 'LS@2' -> room
const occluders = [];
const pickables = [];
const labelItems = [];      // {el, pos, floor, kind, room}

function addLabel(text, cls, pos, floor, extra) {
  const el = document.createElement('div');
  el.className = 'gd-lbl ' + cls.split(' ').map((c: string) => 'gd-' + c).join(' ');
  if (typeof text === 'string') el.textContent = text; else el.appendChild(text);
  labelsEl.appendChild(el);
  const it = Object.assign({el, pos, floor, kind: cls.split(' ')[0], text: typeof text === 'string' ? text : ''}, extra || {});
  labelItems.push(it);
  return it;
}

for (const f of [1, 2, 3]) {
  const F = PLAN[f];
  const group = new THREE.Group(); group.position.y = level(f); scene.add(group);
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  floors[f] = {group, routeGroup, F};

  const sg = extrude(F.outline, SLAB, F.holes); sg.translate(0, -SLAB, 0);
  const slab = new THREE.Mesh(sg, F.ghost ? [ghostTop, ghostSide] : [slabTop, slabSide]);
  slab.renderOrder = F.ghost ? -1 : 0;
  group.add(slab);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(sg, 20), F.ghost ? lineMatGhost : lineMat));
  if (!F.ghost) { occluders.push(slab); slab.layers.enable(1); }   // 图层 1：透视路线时只拿楼板挡

  for (const r of F.rooms) {
    const st = TYPE_STYLE[r.t];
    let geo;
    if (r.oct) {
      geo = new THREE.CylinderGeometry(r.oct[2] * S, r.oct[2] * S, st.h, 8);
      geo.rotateY(Math.PI / 8);
      geo.translate(wx(r.oct), st.h / 2, wz(r.oct));
    } else geo = extrude(r.p, st.h);
    const isRoof = r.t === 'roof';
    const mat = new THREE.MeshLambertMaterial({color: st.c, transparent: isRoof, opacity: isRoof ? 0.28 : 1, depthWrite: !isRoof});
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), isRoof ? lineMatGhost : lineMat);
    group.add(edges);
    const c = r.oct ? [r.oct[0], r.oct[1]] : centroid(r.p);
    const room = {name: r.n, key: r.key || r.n, type: r.t, floor: f, poly: r.p, oct: r.oct, door: r.d, c, h: st.h, mesh, edges, baseColor: st.c};
    mesh.userData.room = room;
    rooms.push(room);
    if (!isRoof) occluders.push(mesh);
    if (r.t === 'stair') { room.name = {LS: '左下楼梯', CS: '中间楼梯', OS: '旋转楼梯'}[r.id] || r.n; stairs[r.id + '@' + f] = room; continue; }
    if (SELECTABLE.has(r.t)) { roomByName[r.n] = room; pickables.push(mesh); }
    else if (!isRoof) pickables.push(mesh);
    const txt = isRoof ? '屋面（下面是舞蹈房）' : r.n;
    room.label = addLabel(txt, 'room' + (r.t === 'wc' ? ' wc' : ''), W3(f, c, st.h + 0.05), f, {room});
  }
  F.marks.forEach(m => addLabel(m.n, 'mark', W3(f, m.at, 0.05), f));
  const tagEl = document.createElement('div');
  tagEl.innerHTML = F.tag + (F.tagSub ? `<small>${F.tagSub}</small>` : '');
  floors[f].tag = addLabel(tagEl, 'floor', W3(f, [95, 760], 0), f, {tagText: F.tag, tagSub: F.tagSub || ''});
}

// 楼梯竖井（半透明，表示连通的楼层）
const shaftMat = new THREE.MeshLambertMaterial({color: 0x9aa3b0, transparent: true, opacity: 0.13, depthWrite: false});
const shafts = SHAFTS.map(sh => {
  const g = new THREE.Group();
  for (let f = sh.from; f < sh.to; f++) {
    const a = stairs[sh.id + '@' + f], b = stairs[sh.id + '@' + (f + 1)];
    const h = GAP - SLAB - a.h;
    let geo;
    if (a.oct) { geo = new THREE.CylinderGeometry(a.oct[2] * S * 0.9, a.oct[2] * S * 0.9, h, 8); geo.rotateY(Math.PI / 8); geo.translate(wx(a.oct), 0, wz(a.oct)); }
    else { const c = centroid(a.poly), cb = centroid(b.poly); geo = extrude(a.poly.map(p => [p[0] + (cb[0] - c[0]) / 2, p[1] + (cb[1] - c[1]) / 2]), h); geo.translate(0, -h / 2, 0); }
    const m = new THREE.Mesh(geo, shaftMat);
    m.position.y = level(f) + a.h + h / 2;
    m.userData.floors = [f, f + 1];
    g.add(m);
  }
  scene.add(g);
  return g;
});

/* ================================================================
   四、路线图（走廊节点 + 楼梯）
   ================================================================ */
const NODES = {}, ADJ = {};
for (const f of [1, 2, 3]) {
  const F = PLAN[f];
  for (const k in F.nodes) { NODES[k] = {f, p: F.nodes[k]}; ADJ[k] = []; }
}
const link = (a, b, w) => { ADJ[a].push([b, w]); ADJ[b].push([a, w]); };
for (const f of [1, 2, 3]) PLAN[f].edges.forEach(([a, b]) => link(a, b, Math.hypot(NODES[a].p[0] - NODES[b].p[0], NODES[a].p[1] - NODES[b].p[1])));
STAIR_LINKS.forEach(([a, b]) => link(a, b, 160));

function dijkstra(src) {
  const dist = {}, prev = {}, done = new Set();
  for (const k in NODES) dist[k] = Infinity;
  dist[src] = 0;
  while (true) {
    let u = null, best = Infinity;
    for (const k in dist) if (!done.has(k) && dist[k] < best) { best = dist[k]; u = k; }
    if (u === null) break;
    done.add(u);
    for (const [v, w] of ADJ[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  return {dist, prev};
}
// 自定义起点：在图上点的位置，垂直接到同层最近的一段走廊上（临时节点，每次应用配置时重建）
const TEMP_NODES = [];
function clearTempNodes() {
  TEMP_NODES.forEach(k => { ADJ[k].forEach(([v]) => { ADJ[v] = ADJ[v].filter(([x]) => x !== k); }); delete ADJ[k]; delete NODES[k]; });
  TEMP_NODES.length = 0;
}
function addTempNode(id, f, p) { NODES[id] = {f, p}; ADJ[id] = []; TEMP_NODES.push(id); }
function attachPoint(f, p) {
  let best = null;
  PLAN[f].edges.forEach(([a, b]) => {
    const A = NODES[a].p, B = NODES[b].p, dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L2));
    const q = [A[0] + t * dx, A[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = {a, b, q, d};
  });
  if (!best) return null;
  const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
  addTempNode('_custom', f, p);
  addTempNode('_proj', f, best.q);
  link('_proj', best.a, dist(best.q, NODES[best.a].p));
  link('_proj', best.b, dist(best.q, NODES[best.b].p));
  link('_custom', '_proj', best.d);
  return '_custom';
}
// 自动命名：点在房间里 → 房间名；否则 → 离得最近的房间 / 区域 / 入口 + 「旁」
function insidePoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToPoly(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const A = poly[j], B = poly[i], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L2));
    d = Math.min(d, Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dy));
  }
  return d;
}
function placeName(f, p) {
  const floorTag = PLAN[f].tag.replace(' ', '');
  let best = null;
  const consider = (name, d, inside) => { if (!best || d < best.d) best = {name, d, inside}; };
  rooms.filter(r => r.floor === f).forEach(r => {
    if (r.oct) { const d = Math.hypot(p[0] - r.oct[0], p[1] - r.oct[1]) - r.oct[2]; consider(r.name, Math.max(0, d), d <= 0); return; }
    if (insidePoly(p, r.poly)) consider(r.name, 0, true); else consider(r.name, distToPoly(p, r.poly), false);
  });
  PLAN[f].marks.forEach(m => { const n = m.n.replace(/\s/g, ''); if (n === '上空') return; const d = Math.hypot(p[0] - m.at[0], p[1] - m.at[1]); consider(n, d * 0.8, d < 70); });   // 区域名：离得近就算在区域里，不加「旁」
  Object.entries(ENTRIES).forEach(([k, e]) => { const n = NODES[e.node]; if (n.f === f && !k.startsWith('一楼')) consider(k.replace(/^[一二三]楼/, ''), Math.hypot(p[0] - n.p[0], p[1] - n.p[1]) * 0.5, false); });   // 入口（连廊 / 东门）优先
  if (!best) return floorTag + '自定义起点';
  return floorTag + best.name + (best.inside ? '' : '旁');
}
// 起点：字符串 = 预设入口；对象 {名称, 楼层, 位置:[x,y]} = 自定义
let currentStart = null;
function resolveStart() {
  const s: any = cfg.start;
  if (!s) return null;
  if (typeof s === 'string') { const e = ENTRIES[s]; return e ? {node: e.node, short: s, label: e.label} : null; }
  if (s.floor && PLAN[s.floor] && Array.isArray(s.pos)) {
    const node = attachPoint(+s.floor, s.pos);
    const nm = s.name || '自定义起点';
    return node ? {node, short: nm, label: nm, custom: true} : null;
  }
  return null;
}
function nearestNode(room) {
  let best = null, bd = Infinity;
  for (const k in NODES) {
    const n = NODES[k]; if (n.f !== room.floor || k[0] === '_') continue;
    const d = Math.hypot(n.p[0] - room.door[0], n.p[1] - room.door[1]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/* ================================================================
   五、应用配置：高亮、标注、路线、列表
   ================================================================ */
let groups = [];        // 每个地点一个标注 {room, acts:[{i,名称,时间,color}], el, pos}
let routeSegs = [];     // 箭头动画用
let pins = [];
let usedFloors = new Set();
let floorMode = 'auto'; // 'auto' | 'all' | 1 | 2 | 3
let labelMode: LabelMode = 'all';
// 房间名、地点标记只在「全部」时显示；活动标注在「隐藏」时不显示。楼层名和起点 / 签到点一直显示。
const nameShown = (it: any) => (it.kind !== 'room' && it.kind !== 'mark') || labelMode === 'all';
// 房间跟着标签走：标签被藏起来的房间变半透明（「仅活动」= 没活动的房间，「隐藏」= 所有房间）。
// 楼梯（没有标签）和本来就半透明的屋面不动。
const FADED_OPACITY = 0.3;
// 拖动过的标注。偏移量用地图单位（沿屏幕横 / 竖方向），按当前镜头换算成像素，所以缩放、
// 旋转地图后标注还跟着它指的房间走。编辑时拖动会写进配置（保存后所有人看到同样的布局）；
// 不在编辑时拖动先记在这里，只在这次打开里有效，进入编辑时会带进配置。null = 点 ↺ 放回自动位置。
type Off = [number, number];
let localOffsets: Record<string, Off | null> = {};
const offsetOf = (key: string): Off | null => (key in localOffsets ? localOffsets[key] : cfg.labels?.[key] ?? null);
function pxPerUnit(cam, pos, W, H) {
  cam.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
  const a = projectTo(cam, pos, W, H), b = projectTo(cam, pos.clone().add(right), W, H);
  return Math.hypot(b.x - a.x, b.y - a.y) || 1;
}
// 引线从锚点连到卡片 / 牌子上离它最近的一点；锚点落在卡片里面就不画线。
function leaderEnd(ax, ay, r) {
  const x = Math.min(Math.max(ax, r.x), r.x + r.w), y = Math.min(Math.max(ay, r.y), r.y + r.h);
  return x === ax && y === ay ? null : [x, y];
}
// 让一个标注能拖：ref() 给出它当前的锚点（屏幕坐标）、每地图单位多少像素、参考点（卡片底边中点 /
// 牌子中心）。拖过就吞掉随后的 click（单击卡片 = 把镜头转到教室）。
function makeDraggable(el: HTMLElement, key: string, ref: () => any) {
  let start = null, moved = false;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || pickingStart) return;
    const r = ref(); if (!r) return;
    start = {x: e.clientX, y: e.clientY, rx: r.rx, ry: r.ry}; moved = false;
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });
  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true; el.classList.add('gd-dragging');
    const r = ref(); if (!r) return;
    const round = (v: number) => Math.round(Math.max(-200, Math.min(200, v)) * 100) / 100;
    localOffsets[key] = [round((start.rx + dx - r.ax) / r.u), round((start.ry + dy - r.ay) / r.u)];
  });
  const end = () => {
    if (!start) return;
    start = null; el.classList.remove('gd-dragging');
    if (!moved) return;
    el.addEventListener('click', (ev) => ev.stopImmediatePropagation(), {capture: true, once: true});
    if (editMode) hooks.onLabelMove?.(key, localOffsets[key]);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
// 拖过的标注右上角有个「↺」：只把它放回自动位置，不触发单击（不转镜头）。只在拖过时显示（gd-moved）。
function addResetButton(el: HTMLElement, key: string) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'gd-reset'; b.textContent = '↺'; b.title = '放回原位';
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    localOffsets[key] = null;
    if (editMode) hooks.onLabelMove?.(key, null);
  });
  el.appendChild(b);
}

function applyRoomFade() {
  rooms.forEach((r: any) => {
    if (!r.label || r.type === 'roof') return;
    const faded = labelMode === 'none' || (labelMode === 'acts' && !r.label.hiddenByEvent);
    const m = r.mesh.material;
    if (m.transparent === faded) return;
    m.transparent = faded; m.opacity = faded ? FADED_OPACITY : 1; m.depthWrite = !faded; m.needsUpdate = true;
    r.edges.material = faded ? lineMatGhost : lineMat;
  });
}

const ribbonMat = new THREE.MeshBasicMaterial({color: ROUTE_COLOR, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
// 被房间挡住的路线：第二遍只和楼板比深度，半透明画出来（图层 2）
const ghostRouteMat = new THREE.MeshBasicMaterial({color: ROUTE_COLOR, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
const depthOnlyMat = new THREE.MeshBasicMaterial({colorWrite: false});
function addGhost(rg, mesh) {
  const g = new THREE.Mesh(mesh.geometry, ghostRouteMat);
  g.position.copy(mesh.position); g.quaternion.copy(mesh.quaternion); g.scale.copy(mesh.scale);
  g.userData.floors = mesh.userData.floors;
  g.layers.set(2); g.renderOrder = 1;
  rg.add(g);
}
const ribbonMatSchem = new THREE.MeshBasicMaterial({color: ROUTE_COLOR, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
const chevMat = new THREE.MeshBasicMaterial({color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4});
const chevGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.22, -0.25); s.lineTo(0.05, 0); s.lineTo(-0.22, 0.25); s.lineTo(-0.05, 0.25); s.lineTo(0.22, 0); s.lineTo(-0.05, -0.25); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;
})();

function entryOf(name) {
  if (!name) return null;
  if (name === '起点') return currentStart ? {kind: 'same', f: NODES[currentStart.node].f, p: NODES[currentStart.node].p} : null;
  if (ENTRIES[name]) return {kind: 'entry', ...ENTRIES[name], f: NODES[ENTRIES[name].node].f, p: NODES[ENTRIES[name].node].p};
  const r = roomByName[name];
  if (r) return {kind: 'room', label: name, f: r.floor, p: r.door, room: r};
  return null;
}

function clearDynamic() {
  groups.forEach(g => { g.el.remove(); });
  groups = [];
  pins.forEach(p => { p.label.el.remove(); p.mesh.parent.remove(p.mesh); labelItems.splice(labelItems.indexOf(p.label), 1); });
  pins = [];
  for (const f of [1, 2, 3]) { const rg = floors[f].routeGroup; while (rg.children.length) rg.remove(rg.children[0]); }
  routeSegs = [];
  rooms.forEach(r => {
    r.mesh.material.color.setHex(r.baseColor);
    r.mesh.scale.y = 1; r.edges.scale.y = 1;
    if (r.label) r.label.hiddenByEvent = false;
  });
}

function addPin(entry, text, cls) {
  const g = new THREE.Group();
  const color = cls === 'sign' ? 0xe0782b : 0x22252b;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), new THREE.MeshLambertMaterial({color}));
  stick.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshLambertMaterial({color}));
  head.position.y = 2.7;
  g.add(stick, head);
  const pos = W3(entry.f, entry.p, 0);
  g.position.copy(pos);
  floors[entry.f].routeGroup.add(g);
  const key = cls === 'sign' ? '@sign' : '@start';
  const label = addLabel(text, 'pin ' + cls, pos.clone().add(new THREE.Vector3(0, 3.9, 0)), entry.f,
    {always: true, pinCls: cls, key, anchor: pos.clone().add(new THREE.Vector3(0, 2.7, 0))});
  makeDraggable(label.el, key, () => label.ref);
  pins.push({mesh: g, label});
}

function applyConfig() {
  clearDynamic();
  clearTempNodes();
  usedFloors = new Set();
  const missing = [];

  // 活动分组。编号和颜色按活动在整张列表里的位置（i），和编辑面板一致：还没选地点的活动不上图，
  // 但仍占着自己的编号，后面的活动不往前挤。
  (cfg.activities || []).forEach((a: any, i) => {
    if (!a || !a.place) return;
    const room = roomByName[a.place];
    if (!room) { missing.push(a.place); return; }
    const color = a.color || PALETTE[i % PALETTE.length];
    let g = groups.find(x => x.room === room);
    if (!g) { g = {room, acts: []}; groups.push(g); }
    g.acts.push({i: i + 1, name: a.name || a.place, time: a.time || '', color});
    usedFloors.add(room.floor);
  });
  groups.forEach(g => {
    const r = g.room, col = new THREE.Color(g.acts[0].color);
    r.mesh.material.color.copy(col);
    const k = (r.h + 0.8) / r.h;
    r.mesh.scale.y = k; r.edges.scale.y = k;
    if (r.label) r.label.hiddenByEvent = true;
    g.pos = W3(r.floor, r.c, r.h * k + 0.1);
    g.el = makeCalloutEl(g);
    labelsEl.appendChild(g.el);
  });

  // 路线
  const start = currentStart = resolveStart();
  if (start && groups.length) {
    const {dist, prev} = dijkstra(start.node);
    const edgeSet = new Map();
    groups.forEach(g => {
      const end = nearestNode(g.room);
      if (!end || dist[end] === Infinity) return;
      const chain = [end];
      while (chain[0] !== start.node) chain.unshift(prev[chain[0]]);
      for (let i = 0; i < chain.length - 1; i++) edgeSet.set(chain[i] + '>' + chain[i + 1], [NODES[chain[i]], NODES[chain[i + 1]]]);
      edgeSet.set(end + '>door:' + g.room.name, [NODES[end], {f: g.room.floor, p: g.room.door}]);
      chain.forEach(k => usedFloors.add(NODES[k].f));
    });
    edgeSet.forEach(([a, b]) => drawRouteSeg(a, b));
  }
  let startPin = null;
  if (start) { addPin({f: NODES[start.node].f, p: NODES[start.node].p}, '起点 · ' + start.short, 'start'); startPin = pins[pins.length - 1]; usedFloors.add(NODES[start.node].f); }
  const sign = entryOf(cfg.sign);
  if (sign) {
    if (startPin && (sign.kind === 'same' || (sign.kind === 'entry' && sign.node === start.node))) {
      startPin.label.el.textContent = '起点 / 签到处 · ' + start.short;
      startPin.label.el.classList.add('gd-sign');
      startPin.label.pinCls = 'sign';
    } else {
      addPin(sign, '签到处', 'sign');
      usedFloors.add(sign.f);
    }
  }
  pins.forEach(p => { p.label.text = p.label.el.textContent; addResetButton(p.label.el, p.label.key); });
  if (!usedFloors.size) [2, 3].forEach(f => usedFloors.add(f));

  applyRoomFade();
  hooks.onChange?.(groups.map((g: any) => ({place: g.room.name, floor: g.room.floor, acts: g.acts})), missing);
  setFloorMode(floorMode, false);
}

function makeCalloutEl(g) {
  const el = document.createElement('div');
  el.className = 'gd-callout';
  const r = g.room;
  el.innerHTML = `<div class="gd-badges">${g.acts.map(a => `<span class="gd-badge" style="background:${a.color}">${a.i}</span>`).join('')}</div>
    <div class="gd-rows">${g.acts.map((a, j) => `<div><div class="gd-nm">${esc(a.name)}</div><div class="gd-mt">${esc(metaLine(j === 0 ? r.name : '', a.time))}</div></div>`).join('')}</div>`;
  el.addEventListener('click', () => focusRoom(r));
  makeDraggable(el, r.name, () => g.ref);
  addResetButton(el, r.name);
  return el;
}
const metaLine = (...parts) => parts.filter(Boolean).join(' · ');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function drawRouteSeg(a, b) {
  const rg = floors[a.f].routeGroup;
  if (a.f !== b.f) {     // 楼梯：竖直连线
    const pa = W3(a.f, a.p, 0.2), pb = W3(b.f, b.p, 0.2);
    const len = pa.distanceTo(pb);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 10), ribbonMat);
    cyl.position.copy(pa).add(pb).multiplyScalar(0.5);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
    cyl.userData.floors = [a.f, b.f];
    rg.add(cyl);
    addGhost(rg, cyl);
    return;
  }
  const schem = PLAN[a.f].schematic;
  const pa = W3(a.f, a.p, 0.04), pb = W3(b.f, b.p, 0.04);
  const dir = pb.clone().sub(pa), len = dir.length(); if (len < 0.01) return;
  const ang = Math.atan2(-dir.z, dir.x);
  const W = 0.7;
  const addPiece = (t0, t1) => {
    const pg = new THREE.PlaneGeometry((t1 - t0) * len, W); pg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(pg, schem ? ribbonMatSchem : ribbonMat);
    m.rotation.y = ang;
    m.position.copy(pa).addScaledVector(dir, (t0 + t1) / 2);
    rg.add(m); m.updateMatrix(); addGhost(rg, m);
  };
  if (schem) { const n = Math.max(1, Math.round(len / 2)); for (let i = 0; i < n; i++) addPiece(i / n, (i + 0.55) / n); }
  else addPiece(0, 1);
  if (!schem) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(W / 2, 16), ribbonMat);
    disc.rotation.x = -Math.PI / 2; disc.position.copy(pb); rg.add(disc);
    const chevs = [];
    const n = Math.max(1, Math.floor(len / 2.4));
    for (let i = 0; i < n; i++) { const c = new THREE.Mesh(chevGeo, chevMat); c.layers.enable(2); c.renderOrder = 2; c.rotation.y = ang; c.position.y = pa.y + 0.01; rg.add(c); chevs.push(c); }
    routeSegs.push({pa, dir, len, chevs, spacing: len / n});
  }
}

/* ================================================================
   六、楼层显示 & 镜头
   ================================================================ */
function visibleFloors() {
  if (floorMode === 'all') return [1, 2, 3];
  if (floorMode === 'auto') return [1, 2, 3].filter(f => usedFloors.has(f));
  return [floorMode];
}
function setFloorMode(mode, animate = true) {
  floorMode = mode;
  const vis = visibleFloors();
  for (const f of [1, 2, 3]) {
    floors[f].group.visible = vis.includes(f);
    floors[f].routeGroup.visible = vis.includes(f);
  }
  // 跨楼层的路线竖线 / 楼梯竖井：两层都显示才显示
  for (const f of [1, 2, 3]) floors[f].routeGroup.children.forEach(c => { if (c.userData.floors) c.visible = c.userData.floors.every(x => vis.includes(x)); });
  shafts.forEach(g => g.children.forEach(m => m.visible = m.userData.floors.every(x => vis.includes(x))));
  hooks.onFloorMode?.(floorMode);
  fitView(animate);
}
function boxPoints(vis) {
  const pts = [];
  vis.forEach(f => PLAN[f].outline.forEach(p => { pts.push(W3(f, p, -SLAB)); pts.push(W3(f, p, 3.5)); }));
  vis.forEach(f => pts.push(W3(f, [-50, 760], 0)));    // 楼层标签（文字在锚点左侧）
  return pts;
}
// 保持当前视角方向，计算能完整装下这些点的镜头位置。bounds 为屏幕上可用区域（NDC）。
function solveFit(cam, pts, bounds, dirOverride) {
  const f = dirOverride ? dirOverride.clone() : new THREE.Vector3().subVectors(controls.target, cam.position).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const tanV = Math.tan(cam.fov * Math.PI / 360), tanH = tanV * cam.aspect;
  const hw = (bounds.r - bounds.l) / 2, hh = (bounds.t - bounds.b) / 2;
  const target = new THREE.Vector3(); pts.forEach(p => target.add(p)); target.multiplyScalar(1 / pts.length);
  let d = 100;
  for (let it = 0; it < 6; it++) {
    d = 0;
    pts.forEach(p => {
      const v = p.clone().sub(target), x = v.dot(r), y = v.dot(u), w = v.dot(f);
      d = Math.max(d, Math.abs(x) / (hw * tanH) - w, Math.abs(y) / (hh * tanV) - w);
    });
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    pts.forEach(p => {
      const v = p.clone().sub(target), z = d + v.dot(f);
      const nx = v.dot(r) / (z * tanH), ny = v.dot(u) / (z * tanV);
      minx = Math.min(minx, nx); maxx = Math.max(maxx, nx); miny = Math.min(miny, ny); maxy = Math.max(maxy, ny);
    });
    target.addScaledVector(r, (minx + maxx) / 2 * d * tanH).addScaledVector(u, (miny + maxy) / 2 * d * tanV);
  }
  const cx = (bounds.l + bounds.r) / 2, cy = (bounds.b + bounds.t) / 2;
  const viewCenter = target.clone().addScaledVector(r, -cx * d * tanH).addScaledVector(u, -cy * d * tanV);
  return {pos: viewCenter.clone().addScaledVector(f, -d), target: viewCenter};
}
const DEFAULT_DIR = (() => { const pol = 63 * Math.PI / 180, az = 16 * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(pol) * Math.sin(az), -Math.cos(pol), -Math.sin(pol) * Math.cos(az)).normalize(); })();

function screenBounds() {
  const W = stage.clientWidth || 1, H = stage.clientHeight || 1;
  const ins = Object.assign({left: 24, right: 24, top: 24, bottom: 24}, hooks.insets?.() || {});
  const toX = (px: number) => px / W * 2 - 1, toY = (py: number) => 1 - py / H * 2;
  return {l: toX(ins.left), r: toX(W - ins.right), t: toY(ins.top), b: toY(H - ins.bottom)};
}
let tween = null;
function moveCamera(pos, target, animate) {
  if (!animate) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return; }
  tween = {p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur: 650};
}
let firstFit = true;
function fitView(animate = true) {
  const sol = solveFit(camera, boxPoints(visibleFloors()), screenBounds(), firstFit ? DEFAULT_DIR : null);
  firstFit = false;
  moveCamera(sol.pos, sol.target, animate);
}
function focusRoom(room) {
  if (!room) return;
  if (!visibleFloors().includes(room.floor) || visibleFloors().length > 1) setFloorMode(room.floor, true);
  const g = groups.find(x => x.room === room);
  if (g) { g.el.classList.remove('gd-pulse'); void g.el.offsetWidth; g.el.classList.add('gd-pulse'); }
}

/* ================================================================
   七、标签：投影、遮挡、标注避让
   ================================================================ */
const raycaster = new THREE.Raycaster();
function projectTo(cam, pos, W, H) {
  const v = pos.clone().project(cam);
  return {x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1};
}
function isOccluded(cam, pos) {
  const origin = cam.position, dir = pos.clone().sub(origin), dist = dir.length();
  raycaster.set(origin, dir.normalize()); raycaster.far = dist - 0.35; raycaster.near = 0;
  const vis = occluders.filter(m => m.parent.visible);
  return raycaster.intersectObjects(vis, false).length > 0;
}
// 标注避让：卡片默认在锚点正上方，与已放置的卡片重叠就往上挪
function layoutCallouts(items, gap, fixed) {
  const placed = (fixed || []).slice();   // 起点 / 签到牌子等，标注卡要避开
  items.forEach(it => { if (it.fixed) placed.push(it); });   // 拖过的卡片位置不动，其余的避开它们
  items.filter(it => !it.fixed).sort((a, b) => b.ay - a.ay).forEach(it => {
    let x = it.ax - it.w / 2, y = it.ay - gap - it.h;
    for (let k = 0; k < 40; k++) {
      const hit = placed.find(p => x < p.x + p.w + 4 && x + it.w + 4 > p.x && y < p.y + p.h + 4 && y + it.h + 4 > p.y);
      if (!hit) break;
      y = hit.y - it.h - 6;
    }
    it.x = x; it.y = y; placed.push(it);
  });
  return items;
}

let occFrame = 0, occDirty = true;
function updateLabels() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const vis = visibleFloors();
  const checkOcc = occDirty || (occFrame++ % 6 === 0);
  labelItems.forEach(it => {
    const show = vis.includes(it.floor) && !it.hiddenByEvent && nameShown(it);
    if (!show) { it.el.style.display = 'none'; return; }
    const p = projectTo(camera, it.pos, W, H);
    if (p.behind) { it.el.style.display = 'none'; return; }
    it.el.style.display = '';
    if (it.kind === 'floor') it.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-100%,-50%)`;
    else if (it.kind === 'pin') {
      // 牌子默认在针头正上方；拖过就放在锚点（针头）加偏移处，画引线回针头。
      const a = projectTo(camera, it.anchor, W, H), u = pxPerUnit(camera, it.anchor, W, H);
      const off = offsetOf(it.key);
      const cx = off ? a.x + off[0] * u : p.x, cy = off ? a.y + off[1] * u : p.y;
      const w = it.el.offsetWidth, h = it.el.offsetHeight;
      it.el.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
      it.ref = {ax: a.x, ay: a.y, u, rx: cx, ry: cy};
      it.rect = {x: cx - w / 2, y: cy - h / 2, w, h};
      it.leader = off ? {ax: a.x, ay: a.y} : null;
      it.el.classList.toggle('gd-moved', !!off);
    }
    else it.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
    if (checkOcc) it.occ = !it.always && it.kind !== 'floor' && isOccluded(camera, it.pos);
    it.el.style.opacity = it.occ ? 0 : 1;
  });
  occDirty = false;
  // 标注
  const items = [];
  groups.forEach(g => {
    if (!vis.includes(g.room.floor) || labelMode === 'none') { g.el.style.display = 'none'; return; }
    g.el.style.display = '';
    const p = projectTo(camera, g.pos, W, H);
    if (!g.size || g.sizeDirty !== false) { g.size = [g.el.offsetWidth, g.el.offsetHeight]; g.sizeDirty = false; }
    const it: any = {g, ax: p.x, ay: p.y, w: g.size[0], h: g.size[1]};
    it.u = pxPerUnit(camera, g.pos, W, H);
    const off = offsetOf(g.room.name);
    if (off) { it.fixed = true; it.x = p.x + off[0] * it.u - it.w / 2; it.y = p.y + off[1] * it.u - it.h; }
    g.el.classList.toggle('gd-moved', !!off);
    items.push(it);
  });
  // 牌子的位置在上面已经算好（相对舞台），标注卡避开它们。
  const shownPins = pins.filter(p => vis.includes(p.label.floor) && p.label.el.style.display !== 'none' && p.label.rect);
  layoutCallouts(items, 22, shownPins.map(p => p.label.rect));
  let svg = '';
  shownPins.forEach(p => {
    const l = p.label; if (!l.leader) return;
    const e = leaderEnd(l.leader.ax, l.leader.ay, l.rect); if (!e) return;
    svg += `<line x1="${l.leader.ax}" y1="${l.leader.ay}" x2="${e[0]}" y2="${e[1]}" stroke="${l.pinCls === 'sign' ? '#e0782b' : '#22252b'}" stroke-width="1.5"/>`;
  });
  items.forEach(it => {
    it.g.el.style.transform = `translate(${it.x}px,${it.y}px)`;
    it.g.ref = {ax: it.ax, ay: it.ay, u: it.u, rx: it.x + it.w / 2, ry: it.y + it.h};
    const col = it.g.acts[0].color, e = leaderEnd(it.ax, it.ay, it);
    if (e) svg += `<line x1="${it.ax}" y1="${it.ay}" x2="${e[0]}" y2="${e[1]}" stroke="${col}" stroke-width="1.5"/>`;
    svg += `<circle cx="${it.ax}" cy="${it.ay}" r="3.5" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
  });
  leadersEl.innerHTML = svg;
}

/* ================================================================
   八、交互
   ================================================================ */
// 按下的位置在楼上 → 左键 / 单指旋转；在空白处 → 平移。
// 挂在父元素的捕获阶段，保证在 OrbitControls 处理按下事件之前改好模式。
const ndcOf = (clientX: number, clientY: number) => {
  const b = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2((clientX - b.left) / b.width * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
};
function floorMeshes() {
  const meshes: THREE.Object3D[] = [];
  for (const f of [1, 2, 3]) if (floors[f].group.visible) floors[f].group.children.forEach((c: any) => { if (c.isMesh) meshes.push(c); });
  return meshes;
}
function overBuilding(clientX: number, clientY: number) {
  raycaster.setFromCamera(ndcOf(clientX, clientY), camera); raycaster.far = Infinity; raycaster.near = 0;
  return raycaster.intersectObjects(floorMeshes(), false).length > 0;
}
// The press lands on the building → drag rotates; on empty space → drag pans (mouse left button and
// one finger alike). Capture phase on the container, so it runs before OrbitControls' own handler.
const onPressCapture = (e: PointerEvent) => {
  const over = overBuilding(e.clientX, e.clientY);
  if (e.pointerType === 'touch') controls.touches.ONE = over ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
  else controls.mouseButtons.LEFT = over ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
};
stage.addEventListener('pointerdown', onPressCapture, true);
let downAt: number[] | null = null;
let editMode = false;
let pickingStart = false;
function setPicking(on: boolean) {
  pickingStart = on;
  renderer.domElement.style.cursor = on ? 'crosshair' : '';
  stage.classList.toggle('gd-picking', on);
  if (on && floorMode !== 'all') setFloorMode('all');
}
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  raycaster.setFromCamera(ndcOf(e.clientX, e.clientY), camera); raycaster.far = Infinity;
  if (pickingStart) {   // picking a custom starting point: any slab or room will do
    const hit = raycaster.intersectObjects(floorMeshes(), false)[0];
    if (!hit) { hooks.onPickMiss?.(); return; }
    const f = [1, 2, 3].find(x => floors[x].group === hit.object.parent) as number;
    const pos: Pt = [Math.round(hit.point.x / S + CX), Math.round(hit.point.z / S + CZ)];
    setPicking(false);
    hooks.onPickStart?.({floor: f, pos, autoName: placeName(f, pos)});
    return;
  }
  const hits = raycaster.intersectObjects(pickables.filter((m: any) => m.parent.visible), false);
  if (!hits.length) return;
  const room = hits[0].object.userData.room;
  const g = groups.find((x: any) => x.room === room);
  hooks.onRoomClick?.({name: room.name, floor: room.floor, selectable: SELECTABLE.has(room.type), editing: editMode,
    activities: g ? g.acts.map((a: any) => a.name) : []});
});
controls.addEventListener('change', () => { occDirty = true; });

/* ================================================================
   九、导出图片
   ================================================================ */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function exportLayout(kind, nActs) {
  if (kind === 'phone') {
    const W = 1080, rowH = 104, listH = 90 + Math.max(1, nActs) * rowH + 70, head = 230;
    const H = Math.max(1920, head + 1100 + listH);
    return {W, H, k: 2.0, head: {x: 64, y: 96, h: head}, map: {x: 0, y: head, w: W, h: H - head - listH}, list: {x: 64, y: H - listH, w: W - 128, h: listH, rowH}};
  }
  if (kind === 'a4') {
    const W = 3508, H = 2480, head = 300, listW = 1000;
    return {W, H, k: 3.0, head: {x: 140, y: 150, h: head}, map: {x: 40, y: head, w: W - listW - 80, h: H - head - 60}, list: {x: W - listW, y: head + 20, w: listW - 140, h: H - head - 140, rowH: 190}};
  }
  const W = 1920, H = 1080, head = 150, listW = 560;
  return {W, H, k: 1.55, head: {x: 72, y: 78, h: head}, map: {x: 20, y: head, w: W - listW - 40, h: H - head - 30}, list: {x: W - listW, y: head + 10, w: listW - 72, h: H - head - 60, rowH: 96}};
}

function exportImage(kind: 'phone' | 'a4' | 'screen'): Promise<Blob | null> {
  const flat = []; groups.forEach(g => g.acts.forEach(a => flat.push({a, g}))); flat.sort((x, y) => x.a.i - y.a.i);
  const L = exportLayout(kind, flat.length), k = L.k;
  const cam = camera.clone();
  cam.aspect = L.map.w / L.map.h; cam.updateProjectionMatrix();
  const dir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  const sol = solveFit(cam, boxPoints(visibleFloors()), {l: -0.9, r: 0.9, b: -0.92, t: 0.72}, dir);
  cam.position.copy(sol.pos); cam.lookAt(sol.target); cam.updateMatrixWorld();

  const prevPR = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(L.map.w, L.map.h, false);
  renderAll(cam);

  const out = document.createElement('canvas'); out.width = L.W; out.height = L.H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = BG; ctx.fillRect(0, 0, L.W, L.H);
  ctx.drawImage(renderer.domElement, L.map.x, L.map.y);
  renderer.setPixelRatio(prevPR); onResize();

  const vis = visibleFloors();
  const P = pos => { const p = projectTo(cam, pos, L.map.w, L.map.h); return {x: p.x + L.map.x, y: p.y + L.map.y}; };
  ctx.textBaseline = 'middle';
  // 房间名 / 标记 / 楼层
  labelItems.forEach(it => {
    if (!vis.includes(it.floor) || it.hiddenByEvent || it.kind === 'pin' || !nameShown(it)) return;
    if (it.kind !== 'floor' && isOccluded(cam, it.pos)) return;
    const p = P(it.pos);
    if (it.kind === 'floor') {
      ctx.textAlign = 'right'; ctx.fillStyle = '#3a3d44'; ctx.font = `700 ${22 * k}px ${FONT}`;
      ctx.fillText(it.tagText, p.x, p.y - (it.tagSub ? 6 * k : 0));
      if (it.tagSub) { ctx.font = `${11 * k}px ${FONT}`; ctx.fillStyle = '#6b6f78'; ctx.fillText(it.tagSub, p.x, p.y + 12 * k); }
      return;
    }
    ctx.textAlign = 'center';
    ctx.font = it.kind === 'mark' ? `${10 * k}px ${FONT}` : `${11 * k}px ${FONT}`;
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(it.text, p.x, p.y);
    ctx.fillStyle = it.kind === 'mark' ? '#9a958b' : (it.room && it.room.type === 'wc' ? '#4f6b80' : '#585c64');
    ctx.fillText(it.text, p.x, p.y);
  });
  // 起点 / 签到点
  // 拖过的牌子放在针头加偏移处，先画引线再画牌子。
  const pinRects = [];
  pins.forEach(pn => {
    const it = pn.label; if (!vis.includes(it.floor)) return;
    const off = offsetOf(it.key), a = P(it.anchor), u = pxPerUnit(cam, it.anchor, L.map.w, L.map.h);
    const p = off ? {x: a.x + off[0] * u, y: a.y + off[1] * u} : P(it.pos);
    ctx.font = `600 ${12 * k}px ${FONT}`; const w = ctx.measureText(it.text).width + 16 * k, h = 22 * k;
    const rect = {x: p.x - w / 2, y: p.y - h / 2, w, h};
    pinRects.push(rect);
    const col = it.pinCls === 'sign' ? '#e0782b' : '#22252b';
    const e = off && leaderEnd(a.x, a.y, rect);
    if (e) { ctx.strokeStyle = col; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
    ctx.fillStyle = col;
    roundRect(ctx, rect.x, rect.y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(it.text, p.x, p.y);
  });
  // 活动标注
  const items = [];
  groups.forEach(g => {
    if (!vis.includes(g.room.floor) || labelMode === 'none') return;
    const p = P(g.pos);
    let w = 0;
    g.acts.forEach((a, j) => {
      ctx.font = `700 ${13 * k}px ${FONT}`; w = Math.max(w, ctx.measureText(a.name).width);
      ctx.font = `${11 * k}px ${FONT}`; w = Math.max(w, ctx.measureText(metaLine(j === 0 ? g.room.name : '', a.time)).width);
    });
    const it: any = {g, ax: p.x, ay: p.y, w: w + 44 * k, h: g.acts.length * 38 * k + 10 * k};
    const off = offsetOf(g.room.name);
    if (off) { const u = pxPerUnit(cam, g.pos, L.map.w, L.map.h); it.fixed = true; it.x = p.x + off[0] * u - it.w / 2; it.y = p.y + off[1] * u - it.h; }
    items.push(it);
  });
  layoutCallouts(items, 22 * k, pinRects);
  items.forEach(it => {
    const col = it.g.acts[0].color, e = leaderEnd(it.ax, it.ay, it);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5 * k;
    if (e) { ctx.beginPath(); ctx.moveTo(it.ax, it.ay); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(it.ax, it.ay, 3.5 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.save(); ctx.shadowColor = 'rgba(40,35,25,.18)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 3 * k;
    ctx.fillStyle = '#fff'; roundRect(ctx, it.x, it.y, it.w, it.h, 9 * k); ctx.fill(); ctx.restore();
    it.g.acts.forEach((a, j) => {
      const y0 = it.y + 5 * k + j * 38 * k;
      ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(it.x + 17 * k, y0 + 15 * k, 10 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 ${12 * k}px ${FONT}`; ctx.fillText(String(a.i), it.x + 17 * k, y0 + 15.5 * k);
      ctx.textAlign = 'left'; ctx.fillStyle = '#22252b'; ctx.font = `700 ${13 * k}px ${FONT}`; ctx.fillText(a.name, it.x + 34 * k, y0 + 13 * k);
      ctx.fillStyle = '#6b6f78'; ctx.font = `${11 * k}px ${FONT}`; ctx.fillText(metaLine(j === 0 ? it.g.room.name : '', a.time), it.x + 34 * k, y0 + 29 * k);
    });
  });
  // 标题
  const hk = Math.min(L.W / 1080, L.head.h / 150);   // 标题大小同时受页宽和标题区高度限制
  ctx.textAlign = 'left'; ctx.fillStyle = '#22252b';
  ctx.font = `700 ${Math.round(54 * Math.min(hk, 2.2))}px ${FONT}`;
  ctx.fillText(fitText(ctx, cfg.title || '', L.W - L.head.x * 2), L.head.x, L.head.y);
  if (cfg.subtitle) { ctx.fillStyle = '#6b6f78'; ctx.font = `${Math.round(30 * Math.min(hk, 2.2))}px ${FONT}`; ctx.fillText(cfg.subtitle, L.head.x, L.head.y + 62 * Math.min(hk, 2.2)); }
  // 活动列表
  const ls = L.list.rowH / 104;
  let y = L.list.y + 30 * ls;
  ctx.fillStyle = '#6b6f78'; ctx.font = `600 ${26 * ls}px ${FONT}`; ctx.fillText(`活动（${flat.length}）`, L.list.x, y); y += 50 * ls;
  flat.forEach(({a, g}) => {
    ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(L.list.x + 24 * ls, y + 22 * ls, 22 * ls, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 ${24 * ls}px ${FONT}`; ctx.fillText(String(a.i), L.list.x + 24 * ls, y + 23 * ls);
    ctx.textAlign = 'left'; ctx.fillStyle = '#22252b'; ctx.font = `700 ${32 * ls}px ${FONT}`;
    ctx.fillText(fitText(ctx, a.name, L.list.w - 70 * ls), L.list.x + 66 * ls, y + 12 * ls);
    ctx.fillStyle = '#6b6f78'; ctx.font = `${24 * ls}px ${FONT}`;
    ctx.fillText(fitText(ctx, `${PLAN[g.room.floor].tag} · ${g.room.name}${a.time ? ' · ' + a.time : ''}`, L.list.w - 70 * ls), L.list.x + 66 * ls, y + 50 * ls);
    y += L.list.rowH;
  });
  const start = currentStart;
  if (start) {
    ctx.fillStyle = '#9a958b'; ctx.font = `${20 * ls}px ${FONT}`;
    ctx.fillText(fitText(ctx, `蓝色箭头：从${start.label}出发的路线`, L.list.w), L.list.x, y + 14 * ls);
  }
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

/* ================================================================
   十、启动
   ================================================================ */
// 三遍渲染：① 正常画；② 清深度，只写楼板深度；③ 画半透明路线（被房间挡住的部分也能看到，被上层楼板挡住的仍看不到）
renderer.autoClear = false;
function renderAll(cam) {
  renderer.clear();
  cam.layers.set(0); renderer.render(scene, cam);
  renderer.clearDepth();
  cam.layers.set(1); scene.overrideMaterial = depthOnlyMat; renderer.render(scene, cam); scene.overrideMaterial = null;
  cam.layers.set(2); renderer.render(scene, cam);
  cam.layers.set(0);
}
function onResize() {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  renderer.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  occDirty = true;
}
let resizeT: ReturnType<typeof setTimeout> | undefined;
const ro = new ResizeObserver(() => { onResize(); clearTimeout(resizeT); resizeT = setTimeout(() => fitView(true), 200); });
ro.observe(stage);
onResize();
applyConfig();

let raf = 0;
function animate(now: number) {
  raf = requestAnimationFrame(animate);
  if (tween) {
    const t = Math.min(1, (now - tween.start) / tween.dur); const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
    occDirty = true;
    if (t >= 1) tween = null;
  }
  controls.update();
  const phase = (now / 1000) * 1.6;
  routeSegs.forEach((s: any) => s.chevs.forEach((c: any, i: number) => {
    const d = (i * s.spacing + phase) % s.len;
    c.position.x = s.pa.x + s.dir.x * d / s.len; c.position.z = s.pa.z + s.dir.z * d / s.len;
  }));
  renderAll(camera);
  updateLabels();
}
raf = requestAnimationFrame(animate);

return {
  // 编辑时拖动都经配置回来，本地的临时位置就不用留了。
  setConfig(next: GuideConfig) { cfg = next; if (editMode) localOffsets = {}; applyConfig(); },
  setFloorMode(mode: FloorMode) { setFloorMode(mode); },
  getFloorMode: () => floorMode,
  setLabelMode(mode: LabelMode) { labelMode = mode; applyRoomFade(); occDirty = true; },
  focusRoom(name: string) { focusRoom(roomByName[name]); },
  // 进入编辑时，刚才查看时拖过（或放回原位）的标注一并交给编辑内容，不弹回去；配置回来后
  // setConfig 会清掉这些临时位置。
  setEditMode(on: boolean) {
    editMode = on;
    if (on) Object.entries(localOffsets).forEach(([k, v]) => hooks.onLabelMove?.(k, v));
    else setPicking(false);
  },
  setPicking,
  refit() { fitView(true); },
  exportImage,
  startLabel: () => currentStart?.label ?? null,
  dispose() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    clearTimeout(resizeT);
    stage.removeEventListener('pointerdown', onPressCapture, true);
    controls.dispose();
    scene.traverse((o: any) => { o.geometry?.dispose?.(); });
    renderer.dispose();
    renderer.domElement.remove(); labelsEl.remove(); leadersEl.remove();
  },
};
}
