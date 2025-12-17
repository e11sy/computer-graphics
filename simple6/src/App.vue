<template>
  <div class="app">
    <aside class="sidebar">
      <h2 class="title">Warnock + Hard Shadows</h2>

      <button class="btn" @click="spawnPolyhedra">Polyhedron</button>

      <div class="panel">
        <div class="panelTitle">Scene Rotation</div>

        <div class="row">
          <label>X</label>
          <input type="range" min="-3.14" max="3.14" step="0.01" v-model.number="rotX" @input="requestRender" />
          <span>{{ rotX.toFixed(2) }}</span>
        </div>
        <div class="row">
          <label>Y</label>
          <input type="range" min="-3.14" max="3.14" step="0.01" v-model.number="rotY" @input="requestRender" />
          <span>{{ rotY.toFixed(2) }}</span>
        </div>
        <div class="row">
          <label>Z</label>
          <input type="range" min="-3.14" max="3.14" step="0.01" v-model.number="rotZ" @input="requestRender" />
          <span>{{ rotZ.toFixed(2) }}</span>
        </div>
      </div>

      <div class="panel">
        <div class="panelTitle">Observer (Camera)</div>
        <div class="row">
          <label>X</label>
          <input type="range" min="-6" max="6" step="0.1" v-model.number="camX" @input="requestRender" />
          <span>{{ camX.toFixed(1) }}</span>
        </div>
        <div class="row">
          <label>Y</label>
          <input type="range" min="-6" max="6" step="0.1" v-model.number="camY" @input="requestRender" />
          <span>{{ camY.toFixed(1) }}</span>
        </div>
        <div class="row">
          <label>Z</label>
          <input type="range" min="7" max="22" step="0.1" v-model.number="camZ" @input="requestRender" />
          <span>{{ camZ.toFixed(1) }}</span>
        </div>
      </div>

      <div class="panel">
        <div class="panelTitle">Point Light</div>
        <div class="row">
          <label>X</label>
          <input type="range" min="-8" max="8" step="0.1" v-model.number="lightX" @input="requestRender" />
          <span>{{ lightX.toFixed(1) }}</span>
        </div>
        <div class="row">
          <label>Y</label>
          <input type="range" min="-8" max="8" step="0.1" v-model.number="lightY" @input="requestRender" />
          <span>{{ lightY.toFixed(1) }}</span>
        </div>
        <div class="row">
          <label>Z</label>
          <input type="range" min="-8" max="8" step="0.1" v-model.number="lightZ" @input="requestRender" />
          <span>{{ lightZ.toFixed(1) }}</span>
        </div>

        <div class="row">
          <label>Shadow</label>
          <input type="range" min="0.15" max="0.85" step="0.05" v-model.number="shadowMul" @input="requestRender" />
          <span>{{ shadowMul.toFixed(2) }}</span>
        </div>

        <div class="panelHint">Drag the light marker to move it (hold Shift for depth).</div>
      </div>

      <div class="stats">
        <div>polyhedra: {{ polyhedra.length }}</div>
        <div>triangles (render): {{ lastTriCount }}</div>
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
const EPS = 1e-6;

// Warnock: глубже => меньше “прямоугольного клипа”
const MAX_DEPTH = 11;
const MIN_LEAF = 1;

let polyhedra = [];
let lastTriCount = ref(0);
let rafPending = false;

// scene rotation
let rotX = ref(-0.25);
let rotY = ref(0.55);
let rotZ = ref(0.0);

// camera position
let camX = ref(0.0);
let camY = ref(0.0);
let camZ = ref(11.5);

// light (world space)
let lightX = ref(3.5);
let lightY = ref(4.0);
let lightZ = ref(2.0);

let shadowMul = ref(0.35);

let dragging = false;
let dragMode = null;
let dragPointerId = null;
let lastPx = 0;
let lastPy = 0;
let lightDrag = null;

let currentView = null;
let currentCanvasSize = { width: 0, height: 0 };

// ---------- lifecycle ----------
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
  window.removeEventListener("resize", resizeCanvas);
  const canvas = canvasRef.value;
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

function requestRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

function onPointerDown(e) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  if (dragging) return;

  dragging = true;
  dragPointerId = e.pointerId;
  lastPx = e.clientX;
  lastPy = e.clientY;

  const coords = getCanvasPixel(e);
  const hit = hitTestLight(coords.px, coords.py);

  if (hit) {
    dragMode = "light";
    lightDrag = {
      camZ: hit.cam.z,
      offsetX: coords.px - hit.screen.x,
      offsetY: coords.py - hit.screen.y,
    };
  } else {
    dragMode = "rotate";
    lightDrag = null;
  }

  canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault?.();
}

function onPointerMove(e) {
  if (!dragging || (dragPointerId !== null && e.pointerId !== dragPointerId)) return;

  const dxClient = e.clientX - lastPx;
  const dyClient = e.clientY - lastPy;
  lastPx = e.clientX;
  lastPy = e.clientY;

  if (dragMode === "rotate") {
    rotY.value = wrapAngle(rotY.value + dxClient * 0.007);
    rotX.value = wrapAngle(rotX.value + dyClient * 0.007);
    requestRender();
    return;
  }

  if (dragMode === "light" && lightDrag) {
    const view = currentView;
    if (!view) return;

    if (e.shiftKey) {
      lightDrag.camZ = Math.max(view.near + 0.05, lightDrag.camZ + dyClient * 0.05);
    }

    const { px, py } = getCanvasPixel(e);
    const targetX = px - lightDrag.offsetX;
    const targetY = py - lightDrag.offsetY;

    const W = currentCanvasSize.width;
    const H = currentCanvasSize.height;
    if (!W || !H) return;

    const xNorm = 2 * (targetX / W) - 1;
    const yNorm = -2 * (targetY / H - 0.5);

    const camZ = lightDrag.camZ;
    const camX = (xNorm * camZ) / view.focal;
    const camY = (yNorm * camZ) / view.focal;

    const world = camToWorld({ x: camX, y: camY, z: camZ }, view);
    lightX.value = world.x;
    lightY.value = world.y;
    lightZ.value = world.z;
    requestRender();
  }
}

function onPointerUp(e) {
  if (!dragging) return;
  if (dragPointerId !== null && e.pointerId !== dragPointerId) return;

  const canvas = canvasRef.value;
  if (canvas && canvas.hasPointerCapture?.(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }

  dragging = false;
  dragMode = null;
  dragPointerId = null;
  lightDrag = null;
}

function hitTestLight(px, py) {
  if (!currentView) return null;
  const W = currentCanvasSize.width;
  const H = currentCanvasSize.height;
  if (!W || !H) return null;

  const light = { x: lightX.value, y: lightY.value, z: lightZ.value };
  const cam = worldToCam(light, currentView);
  if (cam.z < currentView.near) return null;

  const screen = project(cam, currentView.focal, W, H);
  const dpr = window.devicePixelRatio || 1;
  const radius = 14 * dpr;
  const dx = px - screen.x;
  const dy = py - screen.y;
  if (dx * dx + dy * dy <= radius * radius) {
    return { cam, screen };
  }
  return null;
}

function getCanvasPixel(e) {
  const canvas = canvasRef.value;
  if (!canvas) return { px: 0, py: 0 };
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    px: (e.clientX - rect.left) * dpr,
    py: (e.clientY - rect.top) * dpr,
  };
}

function computeSceneCenter(polyhedra) {
  if (!polyhedra.length) return { x: 0, y: 0, z: 0 };
  let c = { x: 0, y: 0, z: 0 };
  for (const p of polyhedra) {
    c.x += p.transform.tx;
    c.y += p.transform.ty;
    c.z += p.transform.tz;
  }
  const inv = 1 / polyhedra.length;
  return { x: c.x * inv, y: c.y * inv, z: c.z * inv };
}

// ---------- render ----------
function render() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!polyhedra.length) {
    lastTriCount.value = 0;
    return;
  }

  const cam = { x: camX.value, y: camY.value, z: camZ.value, f: 0.95, near: 0.6 };
  const sceneRot = { rx: rotX.value, ry: rotY.value, rz: rotZ.value };
  const light = { x: lightX.value, y: lightY.value, z: lightZ.value };

  const sceneCenter = computeSceneCenter(polyhedra);
  const view = makeView(cam, sceneRot, sceneCenter);
  currentView = view;
  currentCanvasSize.width = canvas.width;
  currentCanvasSize.height = canvas.height;
  const scene = buildScene(polyhedra, canvas.width, canvas.height, view);
  lastTriCount.value = scene.trisRender.length;
  if (!scene.trisRender.length) return;

  warnock(ctx, scene, 0, 0, canvas.width, canvas.height, 0, light);

  drawLightMarker(ctx, view, light, canvas.width, canvas.height);
}

function drawLightMarker(ctx, view, light, W, H) {
  const lc = worldToCam(light, view);
  if (lc.z < view.near) return;
  const s = project(lc, view.focal, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 230, 90, 0.95)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke();
  ctx.restore();
}

// ---------- Warnock ----------
function warnock(ctx, scene, rx, ry, rw, rh, depth, light) {
  const tris = scene.trisRender;
  if (!tris || tris.length === 0) return;

  const isLeaf = (rw <= MIN_LEAF || rh <= MIN_LEAF || depth >= MAX_DEPTH);

  if (isLeaf) {
    // если дошли до MAX_DEPTH — рисуем пиксельно внутри leaf, чтобы не было “прямоугольного клипа”
    shadeCell(ctx, scene, rx, ry, rw, rh, light, /*precise*/ depth >= MAX_DEPTH);
    return;
  }

  // coherence: 4 corners + center
  const sx = rx + rw * 0.5;
  const sy = ry + rh * 0.5;

  const samples = [
    sampleAt(scene, rx + 0.5,      ry + 0.5,      light),
    sampleAt(scene, rx + rw - 0.5, ry + 0.5,      light),
    sampleAt(scene, rx + 0.5,      ry + rh - 0.5, light),
    sampleAt(scene, rx + rw - 0.5, ry + rh - 0.5, light),
    sampleAt(scene, sx,            sy,            light),
  ];

  const first = samples.find(s => s !== null);
  if (first) {
    const coherent = samples.every(s => {
      if (s === null) return false;
      return (s.tri === first.tri) && (s.shadowed === first.shadowed);
    });

    if (coherent) {
      ctx.fillStyle = first.shadowed ? mulHex(first.tri.baseColor, shadowMul.value) : first.tri.baseColor;
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
    if (subset.length === 0) continue;
    warnock(ctx, { ...scene, trisRender: subset }, qx, qy, qw, qh, depth + 1, light);
  }
}

function shadeCell(ctx, scene, rx, ry, rw, rh, light, precise) {
  if (!precise || (rw <= 1 && rh <= 1)) {
    const sx = rx + rw * 0.5;
    const sy = ry + rh * 0.5;
    const s = sampleAt(scene, sx, sy, light);
    if (!s) return;
    ctx.fillStyle = s.shadowed ? mulHex(s.tri.baseColor, shadowMul.value) : s.tri.baseColor;
    ctx.fillRect(rx, ry, rw, rh);
    return;
  }

  // precise fill (putImageData) to avoid blocky rectangular clipping at MAX_DEPTH
  const w = Math.max(1, Math.floor(rw));
  const h = Math.max(1, Math.floor(rh));
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = rx + i + 0.5;
      const y = ry + j + 0.5;

      const s = sampleAt(scene, x, y, light);
      if (!s) continue;

      const rgb = hexToRgb(s.tri.baseColor);
      const k = s.shadowed ? shadowMul.value : 1.0;

      const idx = (j * w + i) * 4;
      data[idx + 0] = clampInt(rgb.r * k);
      data[idx + 1] = clampInt(rgb.g * k);
      data[idx + 2] = clampInt(rgb.b * k);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, rx, ry);
}

function sampleAt(scene, sx, sy, light) {
  const tri = pickFrontmostTriangleAt(scene.trisRender, sx, sy);
  if (!tri) return null;

  const P = worldPointAtScreen(sx, sy, tri);
  const shadowed = isPointInShadow(P, tri, scene, light);
  return { tri, shadowed };
}

// ---------- shadows (ray to light) ----------
function isPointInShadow(P, selfTri, scene, light) {
  const dir = { x: light.x - P.x, y: light.y - P.y, z: light.z - P.z };
  const dist = len3(dir);
  if (dist < 1e-6) return false;

  const inv = 1 / dist;
  const d = { x: dir.x * inv, y: dir.y * inv, z: dir.z * inv };

  const ray = { o: { x: P.x + d.x * 1e-3, y: P.y + d.y * 1e-3, z: P.z + d.z * 1e-3 }, d };

  for (const t of scene.trisWorld) {
    if (t.faceKey === selfTri.faceKey) continue;
    if (!rayIntersectsAABB(ray, t.aabb)) continue;

    const hit = rayIntersectTri(ray, t.p0, t.p1, t.p2);
    if (!hit) continue;

    if (hit.t > 1e-4 && hit.t < dist - 1e-3) return true;
  }
  return false;
}

function rayIntersectTri(ray, v0, v1, v2) {
  const e1 = sub3(v1, v0);
  const e2 = sub3(v2, v0);
  const p = cross3(ray.d, e2);
  const det = dot3(e1, p);
  if (Math.abs(det) < 1e-8) return null;

  const invDet = 1 / det;
  const tvec = sub3(ray.o, v0);
  const u = dot3(tvec, p) * invDet;
  if (u < 0 || u > 1) return null;

  const q = cross3(tvec, e1);
  const v = dot3(ray.d, q) * invDet;
  if (v < 0 || u + v > 1) return null;

  const t = dot3(e2, q) * invDet;
  if (t <= 0) return null;

  return { t, u, v };
}

function rayIntersectsAABB(ray, aabb) {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (const axis of ["x", "y", "z"]) {
    const o = ray.o[axis];
    const d = ray.d[axis];
    const min = aabb.min[axis];
    const max = aabb.max[axis];

    if (Math.abs(d) < 1e-10) {
      if (o < min || o > max) return false;
      continue;
    }

    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];

    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// ---------- pick + reconstruct ----------
function pickFrontmostTriangleAt(tris, sx, sy) {
  let best = null;
  let bestZ = Infinity;

  for (const t of tris) {
    if (sx < t.bbox.minX || sx > t.bbox.maxX || sy < t.bbox.minY || sy > t.bbox.maxY) continue;
    if (!pointInTri(sx, sy, t)) continue;

    const z = depthAtPointPerspectiveCorrect(sx, sy, t);
    if (z < bestZ) { bestZ = z; best = t; }
  }
  return best;
}

function worldPointAtScreen(px, py, tri) {
  const x0 = tri.x0, y0 = tri.y0;
  const x1 = tri.x1, y1 = tri.y1;
  const x2 = tri.x2, y2 = tri.y2;

  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(denom) < 1e-12) return tri.w0;

  const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom;
  const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom;
  const w2 = 1 - w0 - w1;

  const invZ = w0 * tri.iz0 + w1 * tri.iz1 + w2 * tri.iz2;
  const a = (w0 * tri.iz0) / Math.max(EPS, invZ);
  const b = (w1 * tri.iz1) / Math.max(EPS, invZ);
  const c = (w2 * tri.iz2) / Math.max(EPS, invZ);

  return {
    x: tri.w0.x * a + tri.w1.x * b + tri.w2.x * c,
    y: tri.w0.y * a + tri.w1.y * b + tri.w2.y * c,
    z: tri.w0.z * a + tri.w1.z * b + tri.w2.z * c
  };
}

// ---------- build scene (WITH near clipping) ----------
function makeRandomPolyhedron(polyId) {
  const shapes = [makeCubeQuads(), makeTetrahedron(), makeOctahedron(), makePyramid(), makeTriPrism()];
  const base = shapes[randInt(0, shapes.length - 1)];

  const scale = randRange(0.45, 0.95);
  const rx = randRange(0, Math.PI * 2);
  const ry = randRange(0, Math.PI * 2);
  const rz = randRange(0, Math.PI * 2);

  const tx = randRange(-3.2, 3.2);
  const ty = randRange(-2.6, 2.6);
  const tz = randRange(-3.0, 3.0);

  return {
    polyId,
    vertices: base.vertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
    faces: base.faces,
    transform: { scale, rx, ry, rz, tx, ty, tz },
    color: randomNiceColor()
  };
}

function applyLocalTransform(vertex, transform) {
  let v = scaleVec(vertex, transform.scale);
  v = rotateX(v, transform.rx);
  v = rotateY(v, transform.ry);
  v = rotateZ(v, transform.rz);
  return add3(v, { x: transform.tx, y: transform.ty, z: transform.tz });
}

function rotateEuler(v, rot) {
  let r = { x: v.x, y: v.y, z: v.z };
  r = rotateX(r, rot.rx);
  r = rotateY(r, rot.ry);
  r = rotateZ(r, rot.rz);
  return r;
}

function makeView(cam, sceneRot, sceneCenter) {
  const camBase = { x: cam.x, y: cam.y, z: cam.z };
  const camOffset = sub3(camBase, sceneCenter);
  const orbitOffset = rotateEuler(camOffset, sceneRot);
  const position = add3(sceneCenter, orbitOffset);

  let forward = sub3(sceneCenter, position);
  const dist = len3(forward);
  if (dist < 1e-6) forward = { x: 0, y: 0, z: -1 };
  forward = normalize3(forward);

  let upHint = rotateEuler({ x: 0, y: 1, z: 0 }, sceneRot);
  let right = cross3(forward, upHint);
  if (len3(right) < 1e-6) {
    upHint = { x: 0, y: 0, z: 1 };
    right = cross3(forward, upHint);
  }
  right = normalize3(right);
  const up = normalize3(cross3(right, forward));

  return {
    position,
    forward,
    right,
    up,
    near: cam.near,
    focal: cam.f,
  };
}

function worldToCam(pW, view) {
  const translated = sub3(pW, view.position);
  return {
    x: dot3(translated, view.right),
    y: dot3(translated, view.up),
    z: dot3(translated, view.forward),
  };
}

function camToWorld(pC, view) {
  const right = mul3(view.right, pC.x);
  const up = mul3(view.up, pC.y);
  const forward = mul3(view.forward, pC.z);
  return add3(view.position, add3(add3(right, up), forward));
}

function buildScene(polyhedra, W, H, view) {
  const trisRender = [];
  const trisWorld = [];
  let worldTriId = 1;

  for (const p of polyhedra) {
    // world verts (poly local -> world space)
    const worldVerts = p.vertices.map(v => applyLocalTransform(v, p.transform));

    // camera verts for center / normals etc.
    const camVerts = worldVerts.map(vw => worldToCam(vw, view));

    // poly center in camera space (for outward normal fix)
    let polyCenterC = { x: 0, y: 0, z: 0 };
    for (const v of camVerts) polyCenterC = add3(polyCenterC, v);
    polyCenterC = mul3(polyCenterC, 1 / camVerts.length);

    for (let faceId = 0; faceId < p.faces.length; faceId++) {
      const face = p.faces[faceId];
      const faceKey = `${p.polyId}:${faceId}`;
      const baseColor = hueShiftHex(p.color, (faceId * 22 + p.polyId * 13) % 360);

      // world tris for shadow rays (always, unclipped)
      for (let k = 1; k < face.length - 1; k++) {
        const i0 = face[0], i1 = face[k], i2  = face[k + 1];
        const p0w = worldVerts[i0], p1w = worldVerts[i1], p2w = worldVerts[i2];
        trisWorld.push({
          id: worldTriId++,
          faceKey,
          p0: p0w,
          p1: p1w,
          p2: p2w,
          aabb: triWorldAABB(p0w, p1w, p2w),
        });
      }

      // ---- near clipping for render polygon ----
      const faceCamVerts = face.map(idx => camVerts[idx]);
      const faceWorldVerts = face.map(idx => worldVerts[idx]);
      const minFaceZ = faceCamVerts.reduce((m, v) => Math.min(m, v.z), Infinity);
      const clipNear = minFaceZ <= 0
        ? Math.max(0.02, view.near * 0.25)
        : Math.max(0.02, Math.min(view.near, minFaceZ * 0.5));

      const poly = faceCamVerts.map((camV, idx) => ({
        c: camV,
        w: faceWorldVerts[idx],
      }));

      const clipped = clipPolyNear(poly, clipNear);
      if (clipped.length < 3) continue;

      // compute normal in camera space from clipped polygon
      const v0 = clipped[0].c;
      const v1 = clipped[1].c;
      const v2 = clipped[2].c;
      let n = normalize3(cross3(sub3(v1, v0), sub3(v2, v0)));

      // face center from clipped
      let faceCenter = { x: 0, y: 0, z: 0 };
      for (const vv of clipped) faceCenter = add3(faceCenter, vv.c);
      faceCenter = mul3(faceCenter, 1 / clipped.length);

      // outward fix
      const outwardRef = sub3(faceCenter, polyCenterC);
      if (dot3(n, outwardRef) < 0) n = mul3(n, -1);

      // backface cull
      const viewVec = normalize3(mul3(faceCenter, -1));
      if (dot3(n, viewVec) <= 0) continue;

      // triangulate clipped polygon into fan
      for (let k = 1; k < clipped.length - 1; k++) {
        const C0 = clipped[0].c, C1 = clipped[k].c, C2 = clipped[k + 1].c;
        const W0 = clipped[0].w, W1 = clipped[k].w, W2 = clipped[k + 1].w;

        const s0 = project(C0, view.focal, W, H);
        const s1 = project(C1, view.focal, W, H);
        const s2 = project(C2, view.focal, W, H);

        const tri = {
          faceKey,
          baseColor,

          x0: s0.x, y0: s0.y,
          x1: s1.x, y1: s1.y,
          x2: s2.x, y2: s2.y,

          iz0: 1 / C0.z,
          iz1: 1 / C1.z,
          iz2: 1 / C2.z,

          minZ: Math.min(C0.z, C1.z, C2.z),
          maxZ: Math.max(C0.z, C1.z, C2.z),

          w0: W0,
          w1: W1,
          w2: W2,
        };

        tri.bbox = triBBox(tri);
        trisRender.push(tri);
      }
    }
  }

  return { trisRender, trisWorld };
}

// Sutherland–Hodgman clip against z >= near in CAMERA space
function clipPolyNear(poly, near) {
  const out = [];
  const n = poly.length;
  if (n === 0) return out;

  const inside = (P) => P.c.z >= near - 1e-9;

  for (let i = 0; i < n; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % n];

    const Ain = inside(A);
    const Bin = inside(B);

    if (Ain && Bin) {
      // keep B
      out.push(B);
    } else if (Ain && !Bin) {
      // leaving: add intersection
      out.push(intersectNear(A, B, near));
    } else if (!Ain && Bin) {
      // entering: add intersection then B
      out.push(intersectNear(A, B, near));
      out.push(B);
    }
    // else both out: add nothing
  }

  return out;
}

function intersectNear(A, B, near) {
  const Az = A.c.z, Bz = B.c.z;
  const t = (near - Az) / (Bz - Az); // 0..1
  const lerp3 = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });

  return {
    c: lerp3(A.c, B.c, t),
    w: lerp3(A.w, B.w, t)
  };
}

// ---------- shapes ----------
function makeCubeQuads() {
  const v = [
    { x:-1, y:-1, z:-1 }, { x: 1, y:-1, z:-1 }, { x: 1, y: 1, z:-1 }, { x:-1, y: 1, z:-1 },
    { x:-1, y:-1, z: 1 }, { x: 1, y:-1, z: 1 }, { x: 1, y: 1, z: 1 }, { x:-1, y: 1, z: 1 }
  ];
  const f = [
    [0,1,2,3],
    [4,5,6,7],
    [0,4,5,1],
    [3,2,6,7],
    [0,3,7,4],
    [1,5,6,2]
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
  const f = [[0,1,2],[0,3,1],[0,2,3],[1,3,2]];
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
  const f = [[0,1,2,3],[0,1,4],[1,2,4],[2,3,4],[3,0,4]];
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
    [0,3,4,1],
    [1,4,5,2],
    [2,5,3,0]
  ];
  return { vertices: v, faces: f };
}

// ---------- projection + raster ----------
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

  const tol = 1e-4;
  if (D < 0) return s <= tol && tval <= tol && s + tval >= D - tol;
  return s >= -tol && tval >= -tol && s + tval <= D + tol;
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
function triWorldAABB(a, b, c) {
  return {
    min: { x: Math.min(a.x, b.x, c.x), y: Math.min(a.y, b.y, c.y), z: Math.min(a.z, b.z, c.z) },
    max: { x: Math.max(a.x, b.x, c.x), y: Math.max(a.y, b.y, c.y), z: Math.max(a.z, b.z, c.z) }
  };
}

// ---------- 3D math ----------
function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul3(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross3(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function len3(v) { return Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z); }
function normalize3(v) {
  const m = len3(v) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}
function scaleVec(v, s) { return { x: v.x*s, y: v.y*s, z: v.z*s }; }
function rotateX(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y*c - v.z*s, z: v.y*s + v.z*c };
}
function rotateY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x*c + v.z*s, y: v.y, z: -v.x*s + v.z*c };
}
function rotateZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x*c - v.y*s, y: v.x*s + v.y*c, z: v.z };
}

// ---------- colors ----------
function mulHex(hex, k) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(clampInt(r * k), clampInt(g * k), clampInt(b * k));
}
function hueShiftHex(hex, addHueDeg) {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  hsl.h = (hsl.h + addHueDeg) % 360;
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
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
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
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rp=0, gp=0, bp=0;
  if (h < 60) { rp=c; gp=x; }
  else if (h < 120) { rp=x; gp=c; }
  else if (h < 180) { gp=c; bp=x; }
  else if (h < 240) { gp=x; bp=c; }
  else if (h < 300) { rp=x; bp=c; }
  else { rp=c; bp=x; }

  return { r: clampInt((rp+m)*255), g: clampInt((gp+m)*255), b: clampInt((bp+m)*255) };
}

// ---------- misc ----------
function randRange(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
function randomNiceColor() {
  const h = randInt(0, 359);
  const s = randRange(0.78, 0.96);
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
  grid-template-columns: 300px 1fr;
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

.title { margin: 0 0 6px; font-size: 18px; }

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

.panel {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.22);
  display: grid;
  gap: 8px;
}
.panelHint {
  font-size: 11px;
  color: rgba(233,236,255,0.72);
  line-height: 1.3;
}
.panelTitle {
  font-size: 12px;
  font-weight: 800;
  color: rgba(233,236,255,0.85);
}
.row {
  display: grid;
  grid-template-columns: 18px 1fr 48px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(233,236,255,0.80);
}
.row input[type="range"] { width: 100%; }

.stats {
  margin-top: auto;
  font-size: 12px;
  color: rgba(233,236,255,0.75);
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 10px;
  display: grid;
  gap: 4px;
}

.main { padding: 16px; display: flex; }

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
  cursor: grab;
}
canvas:active { cursor: grabbing; }
</style>
