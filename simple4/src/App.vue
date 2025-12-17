<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">Segment Clip</div>

      <button class="btn primary" @click="generateSegments">
        segments
      </button>

      <button
        class="btn"
        :class="{ active: mode === 'createRect' }"
        @click="toggleUpdateWindow"
      >
        window
      </button>
    </aside>

    <main class="stage">
      <div class="canvasCard">
        <canvas
          ref="canvasRef"
          class="canvas"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseLeave"
          @click="onCanvasClick"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const canvasRef = ref(null);
let ctx = null;

const segments = ref([]);
const mode = ref("idle");

const rect = ref(null);
const tempRect = ref(null);
const firstCorner = ref(null);

const dragging = ref(false);
const dragOffset = ref({ dx: 0, dy: 0 });

let resizeObserver = null;

function getCanvasSize() {
  const canvas = canvasRef.value;
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return { w: 800, h: 600 };

  const r = parent.getBoundingClientRect();
  return { w: Math.max(300, Math.floor(r.width)), h: Math.max(300, Math.floor(r.height)) };
}

function resizeCanvasToDisplaySize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const { w, h } = getCanvasSize();

  const dpr = window.devicePixelRatio || 1;
  const displayW = Math.floor(w * dpr);
  const displayH = Math.floor(h * dpr);

  if (canvas.width !== displayW || canvas.height !== displayH) {
    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
}

function normalizeRect(r) {
  if (!r) return null;
  const x = r.w >= 0 ? r.x : r.x + r.w;
  const y = r.h >= 0 ? r.y : r.y + r.h;
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}

function pointInRect(px, py, r) {
  if (!r) return false;
  const nr = normalizeRect(r);
  return px >= nr.x && px <= nr.x + nr.w && py >= nr.y && py <= nr.y + nr.h;
}

// Liang–Barsky
function clipLineToRect(x1, y1, x2, y2, r) {
  const nr = normalizeRect(r);
  const xmin = nr.x, ymin = nr.y, xmax = nr.x + nr.w, ymax = nr.y + nr.h;

  const dx = x2 - x1, dy = y2 - y1;
  let u1 = 0, u2 = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];

  for (let i = 0; i < 4; i++) {
    const pi = p[i], qi = q[i];
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > u2) return null;
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return null;
        if (t < u2) u2 = t;
      }
    }
  }

  return {
    x1: x1 + u1 * dx,
    y1: y1 + u1 * dy,
    x2: x1 + u2 * dx,
    y2: y1 + u2 * dy,
  };
}

function clear() {
  const { w, h } = getCanvasSize();
  ctx.clearRect(0, 0, w, h);
}

function drawRect(r, { dashed = false } = {}) {
  if (!r) return;
  const nr = normalizeRect(r);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.strokeRect(nr.x, nr.y, nr.w, nr.h);
  ctx.restore();
}

function drawSegments() {
  for (const s of segments.value) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.restore();

    if (rect.value) {
      const clipped = clipLineToRect(s.x1, s.y1, s.x2, s.y2, rect.value);
      if (clipped) {
        ctx.save();
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(clipped.x1, clipped.y1);
        ctx.lineTo(clipped.x2, clipped.y2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

function draw() {
  if (!ctx) return;
  clear();
  drawSegments();
  if (rect.value) drawRect(rect.value);
  if (tempRect.value) drawRect(tempRect.value, { dashed: true });
}

function randInt(min, maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

function generateSegments() {
  const { w, h } = getCanvasSize();
  const count = randInt(10, 20);
  const margin = 24;

  const next = [];
  for (let i = 0; i < count; i++) {
    next.push({
      x1: randInt(margin, w - margin),
      y1: randInt(margin, h - margin),
      x2: randInt(margin, w - margin),
      y2: randInt(margin, h - margin),
    });
  }

  segments.value = next;
  draw();
}

function getMousePos(evt) {
  const canvas = canvasRef.value;
  const r = canvas.getBoundingClientRect();
  return { x: evt.clientX - r.left, y: evt.clientY - r.top };
}

function toggleUpdateWindow() {
  if (mode.value === "createRect") {
    mode.value = "idle";
    firstCorner.value = null;
    tempRect.value = null;
    setCanvasCursor();
    draw();
    return;
  }
  mode.value = "createRect";
  firstCorner.value = null;
  tempRect.value = null;
  setCanvasCursor();
  draw();
}

function setCanvasCursor(overRect = false) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  if (mode.value === "createRect") canvas.style.cursor = "crosshair";
  else if (dragging.value) canvas.style.cursor = "grabbing";
  else if (overRect) canvas.style.cursor = "grab";
  else canvas.style.cursor = "default";
}

function onCanvasClick(evt) {
  if (mode.value !== "createRect") return;
  const { x, y } = getMousePos(evt);

  if (!firstCorner.value) {
    firstCorner.value = { x, y };
    tempRect.value = { x, y, w: 0, h: 0 };
    draw();
    return;
  }

  const start = firstCorner.value;
  rect.value = normalizeRect({ x: start.x, y: start.y, w: x - start.x, h: y - start.y });

  mode.value = "idle";
  firstCorner.value = null;
  tempRect.value = null;
  setCanvasCursor();
  draw();
}

function onMouseDown(evt) {
  const { x, y } = getMousePos(evt);
  if (mode.value === "idle" && rect.value && pointInRect(x, y, rect.value)) {
    dragging.value = true;
    const nr = normalizeRect(rect.value);
    dragOffset.value = { dx: x - nr.x, dy: y - nr.y };
    setCanvasCursor(true);
  }
}

function onMouseMove(evt) {
  const { x, y } = getMousePos(evt);

  const overRect = mode.value === "idle" && rect.value && pointInRect(x, y, rect.value);
  setCanvasCursor(overRect);

  if (mode.value === "createRect" && firstCorner.value) {
    const start = firstCorner.value;
    tempRect.value = { x: start.x, y: start.y, w: x - start.x, h: y - start.y };
    draw();
    return;
  }

  if (dragging.value && rect.value) {
    const nr = normalizeRect(rect.value);
    rect.value = { x: x - dragOffset.value.dx, y: y - dragOffset.value.dy, w: nr.w, h: nr.h };
    draw();
  }
}

function onMouseUp() {
  if (!dragging.value) return;
  dragging.value = false;
  setCanvasCursor(false);
  draw();
}

function onMouseLeave() {
  if (!dragging.value) return;
  dragging.value = false;
  setCanvasCursor(false);
  draw();
}

onMounted(() => {
  const canvas = canvasRef.value;
  ctx = canvas.getContext("2d");

  resizeCanvasToDisplaySize();
  generateSegments();

  resizeObserver = new ResizeObserver(() => resizeCanvasToDisplaySize());
  resizeObserver.observe(canvas.parentElement);

  window.addEventListener("resize", resizeCanvasToDisplaySize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvasToDisplaySize);
  if (resizeObserver && canvasRef.value?.parentElement) {
    resizeObserver.unobserve(canvasRef.value.parentElement);
  }
});
</script>

<style>
/* IMPORTANT: kill default browser margins that cause the “empty space” */
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#app {
  width: 100%;
  height: 100%;
}
</style>

<style scoped>
.app {
  width: 100%;
  height: 100%;
  overflow: hidden;

  display: grid;
  grid-template-columns: 280px 1fr;

  background: radial-gradient(1200px 600px at 20% 10%, rgba(99, 102, 241, 0.10), transparent 55%),
    radial-gradient(900px 500px at 80% 20%, rgba(34, 197, 94, 0.10), transparent 55%),
    #0b1220;
  color: #e5e7eb;
}

.sidebar {
  height: 100%;
  padding: 18px 16px;
  border-right: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(14px);

  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brand {
  font-weight: 800;
  letter-spacing: 0.4px;
  font-size: 14px;
  color: rgba(226, 232, 240, 0.95);
  margin-bottom: 6px;
}

.stage {
  height: 100%;
  padding: 14px;
  display: flex;
  overflow: hidden;
}

.canvasCard {
  flex: 1 1 auto;
  height: 100%;
  overflow: hidden;

  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);

  display: flex;
}

.canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Buttons */
.btn {
  width: 100%;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(2, 6, 23, 0.35);
  color: rgba(226, 232, 240, 0.95);
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.btn:hover {
  transform: translateY(-1px);
  background: rgba(2, 6, 23, 0.5);
  border-color: rgba(148, 163, 184, 0.35);
}

.btn:active {
  transform: translateY(0px);
}

.btn.primary {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.95), rgba(59, 130, 246, 0.92));
  border-color: rgba(99, 102, 241, 0.65);
}

.btn.primary:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 1), rgba(59, 130, 246, 1));
}

.btn.active {
  outline: 2px solid rgba(226, 232, 240, 0.55);
  outline-offset: 2px;
}
</style>
