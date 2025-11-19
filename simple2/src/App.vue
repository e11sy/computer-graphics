<template>
  <main class="app">
    <header class="panel">
      <h1>Ломаная и B-сплайн</h1>
      <p>
        Перемещайте точки на холсте, чтобы изменить ломаную. Выберите степень
        B-сплайна (от 1 до 6), чтобы увидеть изменение кривой.
      </p>
    </header>
    <section class="workspace">
      <canvas
        ref="canvasRef"
        :width="CANVAS_WIDTH"
        :height="CANVAS_HEIGHT"
        aria-label="Холст для редактирования B-сплайна"
      ></canvas>
      <aside class="controls">
        <label class="control">
          <span>Степень B-сплайна:</span>
          <input
            type="range"
            min="1"
            max="6"
            :value="degree"
            @input="handleDegreeInput"
          />
          <input
            type="number"
            min="1"
            max="6"
            :value="degree"
            @input="handleDegreeInput"
            @blur="handleDegreeBlur"
          />
        </label>
        <button type="button" @click="handleReset">Сбросить точки</button>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

interface Point {
  x: number;
  y: number;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const POINT_RADIUS = 10;
const DRAG_RADIUS = 18;
const SAMPLE_RESOLUTION = 320;
const MIN_DEGREE = 1;
const MAX_DEGREE = 6;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const degree = ref<number>(3);
const points = ref<Point[]>([]);

let ctx: CanvasRenderingContext2D | null = null;
let draggingIndex: number | null = null;

const clampDegree = (value: number) =>
  Math.min(MAX_DEGREE, Math.max(MIN_DEGREE, Math.round(value)));

const createDefaultPoints = (): Point[] => {
  const margin = 80;
  const step = (CANVAS_WIDTH - margin * 2) / 6;

  return Array.from({ length: 7 }, (_, index) => ({
    x: margin + step * index,
    y:
      CANVAS_HEIGHT / 2 +
      Math.sin((index / 6) * Math.PI * 1.5) * (CANVAS_HEIGHT / 3) * 0.6
  }));
};

const setupCanvas = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  canvas.width = CANVAS_WIDTH * dpr;
  canvas.height = CANVAS_HEIGHT * dpr;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(dpr, dpr);
  context.lineJoin = "round";
  context.lineCap = "round";

  return context;
};

const clampPoint = (position: Point): Point => ({
  x: Math.max(0, Math.min(CANVAS_WIDTH, position.x)),
  y: Math.max(0, Math.min(CANVAS_HEIGHT, position.y))
});

const drawScene = () => {
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawGrid(ctx);
  drawBSplineCurve(ctx);
  drawPolyline(ctx);
  drawControlPoints(ctx);
};

const drawGrid = (context: CanvasRenderingContext2D) => {
  const spacing = 50;

  context.save();
  context.strokeStyle = "#e2e8f0";
  context.lineWidth = 1;

  for (let x = spacing; x < CANVAS_WIDTH; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, CANVAS_HEIGHT);
    context.stroke();
  }

  for (let y = spacing; y < CANVAS_HEIGHT; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(CANVAS_WIDTH, y);
    context.stroke();
  }

  context.restore();
};

const drawPolyline = (context: CanvasRenderingContext2D) => {
  context.save();
  context.strokeStyle = "#94a3b8";
  context.lineWidth = 2;

  context.beginPath();
  points.value.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();
  context.restore();
};

const drawControlPoints = (context: CanvasRenderingContext2D) => {
  context.save();

  points.value.forEach((point, index) => {
    context.beginPath();
    context.fillStyle = index === draggingIndex ? "#2563eb" : "#1d4ed8";
    context.strokeStyle = "white";
    context.lineWidth = 2;
    context.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });

  context.restore();
};

const drawBSplineCurve = (context: CanvasRenderingContext2D) => {
  const curvePoints = evaluateBSpline(points.value, degree.value, SAMPLE_RESOLUTION);

  if (!curvePoints.length) {
    return;
  }

  context.save();
  context.strokeStyle = "#0ea5e9";
  context.lineWidth = 3;

  context.beginPath();
  curvePoints.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();
  context.restore();
};

const evaluateBSpline = (controlPoints: Point[], degreeValue: number, resolution: number) => {
  const n = controlPoints.length - 1;

  if (degreeValue > n) {
    return [];
  }

  const knots = createClampedUniformKnotVector(n, degreeValue);
  const pointsOnCurve: Point[] = [];
  const domainStart = knots[degreeValue];
  const domainEnd = knots[knots.length - degreeValue - 1];

  for (let i = 0; i <= resolution; i += 1) {
    const u =
      i === resolution
        ? domainEnd
        : domainStart + ((domainEnd - domainStart) * i) / resolution;
    let x = 0;
    let y = 0;

    for (let k = 0; k <= n; k += 1) {
      const basis = coxDeBoor(k, degreeValue, u, knots);
      x += basis * controlPoints[k].x;
      y += basis * controlPoints[k].y;
    }

    pointsOnCurve.push({ x, y });
  }

  return pointsOnCurve;
};

const coxDeBoor = (i: number, degreeValue: number, u: number, knots: number[]): number => {
  if (degreeValue === 0) {
    const isLast = u === knots[knots.length - 1];
    if (
      (u >= knots[i] && u < knots[i + 1]) ||
      (isLast && u >= knots[i] && u <= knots[i + 1])
    ) {
      return 1;
    }
    return 0;
  }

  const leftDenominator = knots[i + degreeValue] - knots[i];
  const rightDenominator = knots[i + degreeValue + 1] - knots[i + 1];
  let leftTerm = 0;
  let rightTerm = 0;

  if (leftDenominator !== 0) {
    leftTerm =
      ((u - knots[i]) / leftDenominator) *
      coxDeBoor(i, degreeValue - 1, u, knots);
  }

  if (rightDenominator !== 0) {
    rightTerm =
      ((knots[i + degreeValue + 1] - u) / rightDenominator) *
      coxDeBoor(i + 1, degreeValue - 1, u, knots);
  }

  return leftTerm + rightTerm;
};

const createClampedUniformKnotVector = (n: number, degreeValue: number) => {
  const m = n + degreeValue + 1;
  const knots: number[] = [];

  for (let i = 0; i <= m; i += 1) {
    if (i <= degreeValue) {
      knots.push(0);
    } else if (i >= m - degreeValue) {
      knots.push(1);
    } else {
      const numerator = i - degreeValue;
      const denominator = m - degreeValue * 2;
      knots.push(numerator / denominator);
    }
  }

  return knots;
};

const getPointerPosition = (event: PointerEvent): Point => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
    y: (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height)
  };
};

const findClosestPoint = (position: Point): number | null => {
  let closestIndex: number | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  points.value.forEach((point, index) => {
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    if (distance <= DRAG_RADIUS && distance < minDistance) {
      minDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
};

const updatePointPosition = (position: Point) => {
  if (draggingIndex === null) {
    return;
  }
  const clamped = clampPoint(position);
  const updatedPoints = points.value.slice();
  updatedPoints[draggingIndex] = clamped;
  points.value = updatedPoints;
  drawScene();
};

const handlePointerDown = (event: PointerEvent) => {
  const position = getPointerPosition(event);
  const index = findClosestPoint(position);

  if (index === null || !canvasRef.value) {
    return;
  }

  draggingIndex = index;
  if (!canvasRef.value.hasPointerCapture(event.pointerId)) {
    canvasRef.value.setPointerCapture(event.pointerId);
  }
  updatePointPosition(position);
};

const handlePointerMove = (event: PointerEvent) => {
  if (draggingIndex === null) {
    return;
  }
  updatePointPosition(getPointerPosition(event));
};

const handlePointerUp = (event: PointerEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    draggingIndex = null;
    return;
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  draggingIndex = null;
};

const handlePointerCaptureLost = () => {
  draggingIndex = null;
};

const resetPoints = () => {
  points.value = createDefaultPoints();
  drawScene();
};

const handleReset = () => {
  draggingIndex = null;
  resetPoints();
};

const handleDegreeInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const value = Number(target.value);

  if (!Number.isFinite(value)) {
    return;
  }

  degree.value = value;
};

const handleDegreeBlur = () => {
  degree.value = clampDegree(degree.value);
};

watch(degree, (newValue, oldValue) => {
  if (!Number.isFinite(newValue)) {
    degree.value = oldValue ?? MIN_DEGREE;
    return;
  }

  const clamped = clampDegree(newValue);
  if (clamped !== newValue) {
    degree.value = clamped;
    return;
  }

  drawScene();
});

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  ctx = setupCanvas(canvas);
  if (!ctx) {
    return;
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("lostpointercapture", handlePointerCaptureLost);

  resetPoints();
});

onBeforeUnmount(() => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  canvas.removeEventListener("pointerdown", handlePointerDown);
  canvas.removeEventListener("pointermove", handlePointerMove);
  canvas.removeEventListener("pointerup", handlePointerUp);
  canvas.removeEventListener("pointerleave", handlePointerUp);
  canvas.removeEventListener("pointercancel", handlePointerUp);
  canvas.removeEventListener("lostpointercapture", handlePointerCaptureLost);
});
</script>

