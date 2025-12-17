<template>
  <div class="app">
    <aside class="sidebar">
      <h2 class="title">Warnock Demo</h2>

      <button class="btn" @click="spawnPolyhedra">
        Polyhedron
      </button>

      <div class="hint">
        <div class="small">
          <b>Warnock (Варнок):</b> рекурсивное деление окна на квадранты + выбор видимой поверхности по глубине.
        </div>
      </div>

      <div class="stats">
        <div>rotX: {{ sceneRotX.toFixed(2) }}</div>
        <div>rotY: {{ sceneRotY.toFixed(2) }}</div>
        <div>polyhedra: {{ polyhedra.length }}</div>
        <div>tris: {{ lastTriCount }}</div>
      </div>
    </aside>

    <main class="main">
      <div class="canvasWrap">
        <canvas ref="canvasRef"></canvas>
      </div>
    </main>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";

const canvasRef = ref(null);
let ctx = null;

const BG = "#0b1020";
const MAX_DEPTH = 9;
const EPS = 1e-6;

let polyhedra = [];
let lastTriCount = ref(0);

// infinite drag rotation
let sceneRotX = ref(-0.25);
let sceneRotY = ref(0.55);

let dragging = false;
let lastPx = 0;
let lastPy = 0;
let rafPending = false;

// ---------- Lifecycle / sizing ----------
function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  const w = Math.max(10, Math.floor(rect.width * dpr));
  const h = Math.max(10, Math.floor(rect.height * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  requestRender();
}

onMounted(() => {
  const canvas = canvasRef.value;
  ctx = canvas.getContext("2d", { alpha: false });

  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);

  requestAnimationFrame(resizeCanvas);
  spawnPolyhedra();
});

onBeforeUnmount(() => {
  const canvas = canvasRef.value;
  window.removeEventListener("resize", resizeCanvas);

  if (canvas) {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerUp);
  }
});

// ---------- UI ----------
function spawnPolyhedra() {
  const count = randInt(3, 7);
  const polys = [];
  for (let i = 0; i < count; i++) polys.push(makeRandomPolyhedron(i));
  polyhedra = polys;
  requestRender();
}

// ---------- Drag rotation (infinite) ----------
function onPointerDown(e) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  dragging = true;
  lastPx = e.clientX;
  lastPy = e.clientY;

  canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault?.();
}

function onPointerMove(e) {
  if (!dragging) return;

  const dx = e.clientX - lastPx;
  const dy = e.clientY - lastPy;
  lastPx = e.clientX;
  lastPy = e.clientY;

  sceneRotY.value = wrapAngle(sceneRotY.value + dx * 0.007);
  sceneRotX.value = wrapAngle(sceneRotX.value + dy * 0.007);

  requestRender();
}

function onPointerUp() {
  dragging = false;
}

// ---------- Render scheduling ----------
function requestRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

// ---------- Rendering ----------
function render() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!polyhedra.length) {
    lastTriCount.value = 0;
    return;
  }

  const tris = buildSceneTriangles(
    polyhedra,
    canvas.width,
    canvas.height,
    sceneRotX.value,
    sceneRotY.value
  );

  lastTriCount.value = tris.length;
  if (!tris.length) return;

  // 1) Warnock fill
  warnock(ctx, tris, 0, 0, canvas.width, canvas.height, 0);

  // 2) Visible-ish edges overlay (approximate but works well visually)
  drawVisibleEdges(ctx, tris);
}

function warnock(ctx, tris, rx, ry, rw, rh, depth) {
  if (!tris || tris.length === 0) return;

  if (rw <= 1 || rh <= 1 || depth >= MAX_DEPTH) {
    const sx = rx + rw * 0.5;
    const sy = ry + rh * 0.5;

    const best = pickFrontmostTriangleAt(tris, sx, sy, rx, ry, rw, rh);
    if (best) {
      ctx.fillStyle = best.color;
      ctx.fillRect(rx, ry, rw, rh);
    }
    return;
  }

  // trivial accept attempt
  const corners = [
    [rx, ry],
    [rx + rw, ry],
    [rx, ry + rh],
    [rx + rw, ry + rh]
  ];

  for (const t of tris) {
    if (!bboxIntersectsRect(t.bbox, rx, ry, rw, rh)) continue;

    let covers = true;
    for (const [cx, cy] of corners) {
      if (!pointInTri(cx, cy, t)) { covers = false; break; }
    }
    if (!covers) continue;

    let inFront = true;
    for (const o of tris) {
      if (o === t) continue;
      if (!bboxIntersectsRect(o.bbox, rx, ry, rw, rh)) continue;
      if (t.maxZ > o.minZ - 1e-3) { inFront = false; break; }
    }

    if (inFront) {
      ctx.fillStyle = t.color;
      ctx.fillRect(rx, ry, rw, rh);
      return;
    }
  }

  // subdivide
  const hw = Math.floor(rw / 2);
  const hh = Math.floor(rh / 2);
  const w1 = Math.max(1, hw);
  const h1 = Math.max(1, hh);
  const w2 = Math.max(1, rw - w1);
  const h2 = Math.max(1, rh - h1);

  const quads = [
    [rx,       ry,       w1, h1],
    [rx + w1,  ry,       w2, h1],
    [rx,       ry + h1,  w1, h2],
    [rx + w1,  ry + h1,  w2, h2]
  ];

  for (const [qx, qy, qw, qh] of quads) {
    const subset = [];
    for (const t of tris) {
      if (bboxIntersectsRect(t.bbox, qx, qy, qw, qh)) subset.push(t);
    }
    warnock(ctx, subset, qx, qy, qw, qh, depth + 1);
  }
}

// ---------- Scene build: per-face hue shift + stronger shading + outward normals ----------
function makeRandomPolyhedron(polyId) {
  const shapes = [makeCube(), makeTetrahedron(), makeOctahedron(), makePyramid(), makeTriPrism()];
  const base = shapes[randInt(0, shapes.length - 1)];

  const scale = randRange(0.45, 0.95);
  const rx = randRange(0, Math.PI * 2);
  const ry = randRange(0, Math.PI * 2);
  const rz = randRange(0, Math.PI * 2);

  const tx = randRange(-2.6, 2.6);
  const ty = randRange(-2.0, 2.0);
  const tz = randRange(-2.0, 2.0);

  // brighter base
  const baseColor = randomNiceColor();

  return {
    polyId,
    vertices: base.vertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
    faces: base.faces,
    transform: { scale, rx, ry, rz, tx, ty, tz },
    color: baseColor
  };
}

function buildSceneTriangles(polyhedra, screenW, screenH, sceneRx, sceneRy) {
  const cam = {
    pos: { x: 0, y: 0, z: 7.2 },
    f: 1.25,
    near: 0.40
  };

  const lightDir = normalize3({ x: -0.35, y: 0.65, z: 1.0 });

  // Make lighting more explicit
  const minLight = 0.55;
  const maxLight = 1.35;
  const specK = 0.40;
  const shininess = 18;

  const out = [];

  for (const p of polyhedra) {
    const worldVerts = p.vertices.map(v => {
      let r = scaleVec(v, p.transform.scale);
      r = rotateX(r, p.transform.rx);
      r = rotateY(r, p.transform.ry);
      r = rotateZ(r, p.transform.rz);
      r = addVec(r, { x: p.transform.tx, y: p.transform.ty, z: p.transform.tz });

      r = rotateX(r, sceneRx);
      r = rotateY(r, sceneRy);
      return r;
    });

    const camVerts = worldVerts.map(vw => ({
      x: vw.x - cam.pos.x,
      y: vw.y - cam.pos.y,
      z: cam.pos.z - vw.z
    }));

    // poly center in camera space (for outward normal fix)
    let polyCenter = { x: 0, y: 0, z: 0 };
    for (const vc of camVerts) polyCenter = add3(polyCenter, vc);
    polyCenter = mul3(polyCenter, 1 / camVerts.length);

    for (let faceId = 0; faceId < p.faces.length; faceId++) {
      const f = p.faces[faceId];

      const v0c = camVerts[f[0]];
      const v1c = camVerts[f[1]];
      const v2c = camVerts[f[2]];

      if (v0c.z < cam.near || v1c.z < cam.near || v2c.z < cam.near) continue;

      const e1 = sub3(v1c, v0c);
      const e2 = sub3(v2c, v0c);
      let n = normalize3(cross3(e1, e2));

      const faceCenter = mul3(add3(add3(v0c, v1c), v2c), 1 / 3);
      const outwardRef = sub3(faceCenter, polyCenter);
      if (dot3(n, outwardRef) < 0) n = mul3(n, -1);

      const viewVec = normalize3(mul3(faceCenter, -1));
      if (dot3(n, viewVec) <= 0) continue;

      const proj0 = project(v0c, cam.f, screenW, screenH);
      const proj1 = project(v1c, cam.f, screenW, screenH);
      const proj2 = project(v2c, cam.f, screenW, screenH);

      // Per-face unique base: shift hue by faceId (and polyId slightly)
      const faceBaseHex = hueShiftHex(p.color, (faceId * 22 + p.polyId * 13) % 360);

      // Lighting
      const diff = Math.max(0, dot3(n, lightDir));
      const intensity = minLight + (maxLight - minLight) * diff;

      const refl = reflect3(mul3(lightDir, -1), n);
      const spec = Math.pow(Math.max(0, dot3(normalize3(refl), viewVec)), shininess);

      const shaded = shadeHex(faceBaseHex, intensity, specK * spec);

      const tri = {
        polyId: p.polyId,
        faceId,

        x0: proj0.x, y0: proj0.y,
        x1: proj1.x, y1: proj1.y,
        x2: proj2.x, y2: proj2.y,

        iz0: 1 / v0c.z,
        iz1: 1 / v1c.z,
        iz2: 1 / v2c.z,

        minZ: Math.min(v0c.z, v1c.z, v2c.z),
        maxZ: Math.max(v0c.z, v1c.z, v2c.z),

        color: shaded
      };

      tri.bbox = triBBox(tri);
      out.push(tri);
    }
  }

  return out;
}

// ---------- Visible edges overlay (approximate) ----------
function drawVisibleEdges(ctx, tris) {
  // draw only if edge is likely visible (sample along it)
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 1;

  const samplesPerEdge = 5;
  const neededWins = 3;

  for (const t of tris) {
    const edges = [
      [t.x0, t.y0, t.x1, t.y1],
      [t.x1, t.y1, t.x2, t.y2],
      [t.x2, t.y2, t.x0, t.y0]
    ];

    for (const [ax, ay, bx, by] of edges) {
      const len2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
      if (len2 < 16) continue; // skip tiny edges

      let wins = 0;
      for (let i = 1; i <= samplesPerEdge; i++) {
        const u = i / (samplesPerEdge + 1);
        const sx = ax + (bx - ax) * u;
        const sy = ay + (by - ay) * u;

        // quick reject: if point not in triangle bbox, skip (cheap)
        if (sx < t.bbox.minX - 1 || sx > t.bbox.maxX + 1 || sy < t.bbox.minY - 1 || sy > t.bbox.maxY + 1) continue;

        const front = pickFrontmostTriangleAt(tris, sx, sy);
        if (front && front === t) wins++;
      }

      if (wins >= neededWins) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function pickFrontmostTriangleAt(tris, sx, sy, rx = null, ry = null, rw = null, rh = null) {
  let best = null;
  let bestZ = Infinity;

  for (const t of tris) {
    if (rx !== null && !bboxIntersectsRect(t.bbox, rx, ry, rw, rh)) continue;
    if (sx < t.bbox.minX || sx > t.bbox.maxX || sy < t.bbox.minY || sy > t.bbox.maxY) continue;
    if (!pointInTri(sx, sy, t)) continue;

    const z = depthAtPointPerspectiveCorrect(sx, sy, t);
    if (z < bestZ) {
      bestZ = z;
      best = t;
    }
  }

  return best;
}

// ---------- Shapes ----------
function makeCube() {
  const v = [
    { x:-1, y:-1, z:-1 }, { x: 1, y:-1, z:-1 }, { x: 1, y: 1, z:-1 }, { x:-1, y: 1, z:-1 },
    { x:-1, y:-1, z: 1 }, { x: 1, y:-1, z: 1 }, { x: 1, y: 1, z: 1 }, { x:-1, y: 1, z: 1 }
  ];
  const f = [
    [0,1,2],[0,2,3],
    [4,6,5],[4,7,6],
    [0,4,5],[0,5,1],
    [3,2,6],[3,6,7],
    [0,3,7],[0,7,4],
    [1,5,6],[1,6,2]
  ];
  return { vertices: v, faces: f };
}

function makeTetrahedron() {
  const v = [
    { x: 1,  y: 1,  z: 1 },
    { x:-1,  y:-1, z: 1 },
    { x:-1,  y: 1,  z:-1 },
    { x: 1,  y:-1, z:-1 }
  ];
  const f = [
    [0,1,2],
    [0,3,1],
    [0,2,3],
    [1,3,2]
  ];
  return { vertices: v, faces: f };
}

function makeOctahedron() {
  const v = [
    { x: 1, y: 0, z: 0 }, { x:-1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y:-1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z:-1 }
  ];
  const f = [
    [0,2,4],[2,1,4],[1,3,4],[3,0,4],
    [2,0,5],[1,2,5],[3,1,5],[0,3,5]
  ];
  return { vertices: v, faces: f };
}

function makePyramid() {
  const v = [
    { x:-1, y:-1, z:-1 },
    { x: 1, y:-1, z:-1 },
    { x: 1, y: 1, z:-1 },
    { x:-1, y: 1, z:-1 },
    { x: 0, y: 0, z: 1 }
  ];
  const f = [
    [0,1,2],[0,2,3],
    [0,1,4],
    [1,2,4],
    [2,3,4],
    [3,0,4]
  ];
  return { vertices: v, faces: f };
}

function makeTriPrism() {
  const v = [
    { x:-1, y:-1, z:-1 }, { x: 1, y:-1, z:-1 }, { x: 0, y: 1, z:-1 },
    { x:-1, y:-1, z: 1 }, { x: 1, y:-1, z: 1 }, { x: 0, y: 1, z: 1 }
  ];
  const f = [
    [0,1,2],
    [3,5,4],
    [0,3,4],[0,4,1],
    [1,4,5],[1,5,2],
    [2,5,3],[2,3,0]
  ];
  return { vertices: v, faces: f };
}

// ---------- Math / raster helpers ----------
function project(vc, f, W, H) {
  const xN = (vc.x / vc.z) * f;
  const yN = (vc.y / vc.z) * f;
  return { x: (xN * 0.5 + 0.5) * W, y: (-yN * 0.5 + 0.5) * H };
}

function triBBox(t) {
  const minX = Math.floor(Math.min(t.x0, t.x1, t.x2));
  const maxX = Math.ceil(Math.max(t.x0, t.x1, t.x2));
  const minY = Math.floor(Math.min(t.y0, t.y1, t.y2));
  const maxY = Math.ceil(Math.max(t.y0, t.y1, t.y2));
  return { minX, minY, maxX, maxY };
}

function bboxIntersectsRect(b, rx, ry, rw, rh) {
  const rMaxX = rx + rw;
  const rMaxY = ry + rh;
  return !(b.maxX < rx || b.minX > rMaxX || b.maxY < ry || b.minY > rMaxY);
}

function pointInTri(px, py, t) {
  const x0 = t.x0, y0 = t.y0;
  const x1 = t.x1, y1 = t.y1;
  const x2 = t.x2, y2 = t.y2;

  const dX = px - x2;
  const dY = py - y2;
  const dX21 = x2 - x1;
  const dY12 = y1 - y2;
  const D = dY12 * (x0 - x2) + dX21 * (y0 - y2);
  const s = dY12 * dX + dX21 * dY;
  const tval = (y2 - y0) * dX + (x0 - x2) * dY;

  if (D < 0) return s <= EPS && tval <= EPS && s + tval >= D - EPS;
  return s >= -EPS && tval >= -EPS && s + tval <= D + EPS;
}

function depthAtPointPerspectiveCorrect(px, py, tri) {
  const x0 = tri.x0, y0 = tri.y0;
  const x1 = tri.x1, y1 = tri.y1;
  const x2 = tri.x2, y2 = tri.y2;

  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom;
  const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom;
  const w2 = 1 - w0 - w1;

  const invZ = w0 * tri.iz0 + w1 * tri.iz1 + w2 * tri.iz2;
  return 1 / Math.max(EPS, invZ);
}

// ---------- 3D vector ----------
function addVec(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scaleVec(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }

function rotateX(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}
function rotateY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}
function rotateZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul3(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function normalize3(v) {
  const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}
function reflect3(i, n) {
  const d = dot3(i, n);
  return sub3(i, mul3(n, 2 * d));
}

// ---------- Color helpers ----------
function shadeHex(baseHex, intensity, specAdd) {
  const { r, g, b } = hexToRgb(baseHex);
  const ir = clampInt(r * intensity + 255 * specAdd);
  const ig = clampInt(g * intensity + 255 * specAdd);
  const ib = clampInt(b * intensity + 255 * specAdd);
  return rgbToHex(ir, ig, ib);
}

function hueShiftHex(hex, addHueDeg) {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  hsl.h = (hsl.h + addHueDeg) % 360;
  // чуть поджать насыщенность/яркость чтобы было “сочно”
  hsl.s = clamp01(hsl.s * 1.05);
  hsl.l = clamp01(hsl.l * 1.02);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}
function clampInt(x) { return Math.max(0, Math.min(255, Math.round(x))); }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// RGB(0..255) -> HSL (h in degrees, s/l in 0..1)
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

// HSL -> RGB(0..255)
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rp = 0, gp = 0, bp = 0;
  if (0 <= h && h < 60) { rp = c; gp = x; bp = 0; }
  else if (60 <= h && h < 120) { rp = x; gp = c; bp = 0; }
  else if (120 <= h && h < 180) { rp = 0; gp = c; bp = x; }
  else if (180 <= h && h < 240) { rp = 0; gp = x; bp = c; }
  else if (240 <= h && h < 300) { rp = x; gp = 0; bp = c; }
  else { rp = c; gp = 0; bp = x; }

  return {
    r: clampInt((rp + m) * 255),
    g: clampInt((gp + m) * 255),
    b: clampInt((bp + m) * 255)
  };
}

// ---------- misc ----------
function randRange(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }

function randomNiceColor() {
  const h = randInt(0, 359);
  const s = randRange(0.72, 0.92);
  const l = randRange(0.62, 0.78);
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function wrapAngle(a) {
  const twoPi = Math.PI * 2;
  a = (a + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return a - Math.PI;
}
</script>

<style scoped>
.app {
  height: 100vh;
  display: grid;
  grid-template-columns: 260px 1fr;
  background: #070a14;
  color: #e9ecff;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif;
}

.sidebar {
  padding: 16px;
  border-right: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0 0 6px;
  font-size: 18px;
  letter-spacing: 0.2px;
}

.btn {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.08);
  color: inherit;
  cursor: pointer;
  font-weight: 700;
}
.btn:hover { background: rgba(255,255,255,0.12); }
.btn:active { transform: translateY(1px); }

.hint {
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.25);
  font-size: 12.5px;
  line-height: 1.3;
  color: rgba(233,236,255,0.92);
}
.hint .small { color: rgba(233,236,255,0.72); }

.stats {
  margin-top: auto;
  font-size: 12px;
  color: rgba(233,236,255,0.75);
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 10px;
  display: grid;
  gap: 4px;
}

.main {
  padding: 16px;
  display: flex;
}

.canvasWrap {
  position: relative;
  flex: 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.10);
  background: #0b1020;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
