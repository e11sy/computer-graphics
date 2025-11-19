<template>
  <div class="app-shell">
    <aside class="toolbar" role="toolbar" aria-label="Инструменты">
      <button
        type="button"
        class="tool-button"
        :class="{ 'tool-button--active': isCircleToolActive }"
        :aria-pressed="isCircleToolActive ? 'true' : 'false'"
        @click="toggleCircleTool"
      >
        Создать окружность
      </button>
      <button
        type="button"
        class="tool-button"
        :class="{ 'tool-button--active': isTangentToolActive }"
        :aria-pressed="isTangentToolActive ? 'true' : 'false'"
        @click="toggleTangentTool"
      >
        Создать касательную
      </button>
    </aside>
    <main class="canvas-area">
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerleave="handlePointerLeave"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerCancel"
      ></canvas>
    </main>
  </div>
</template>

<script lang="ts" setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";

enum Tool {
  Circle = "circle",
  Tangent = "tangent",
}

type Point = {
  x: number;
  y: number;
};

type Circle = {
  center: Point;
  radius: number;
};

type TangentOrientation = -1 | 1;

type TangentSolution = {
  start: Point;
  end: Point;
  circleIndices: [number, number];
  orientation: TangentOrientation;
};

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const activeTool = ref<Tool | null>(null);
const pendingCircleCenter = ref<Point | null>(null);
const previewRadius = ref<number | null>(null);
const circles = ref<Circle[]>([]);
const selectedCircleIndices = ref<number[]>([]);
const tangentCandidates = ref<TangentSolution[]>([]);
const tangentSegments = ref<TangentSolution[]>([]);
const draggingCircleIndex = ref<number | null>(null);
const dragOffset = ref<Point | null>(null);
const resizingCircleIndex = ref<number | null>(null);
const resizeRadiusOffset = ref<number>(0);

const isCircleToolActive = computed(() => activeTool.value === Tool.Circle);
const isTangentToolActive = computed(() => activeTool.value === Tool.Tangent);

const handleResize = () => {
  setCanvasSize();
};

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Не удалось получить контекст 2D для canvas.");
    return;
  }

  requestAnimationFrame(() => {
    setCanvasSize();
  });

  window.addEventListener("resize", handleResize, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
});

function toggleCircleTool() {
  if (activeTool.value === Tool.Circle && !pendingCircleCenter.value) {
    deactivateTools();
    return;
  }
  activateTool(Tool.Circle);
}

function toggleTangentTool() {
  if (activeTool.value === Tool.Tangent) {
    deactivateTools();
    return;
  }
  activateTool(Tool.Tangent);
}

function activateTool(tool: Tool) {
  deactivateTools();
  activeTool.value = tool;
}

function deactivateTools() {
  activeTool.value = null;
  pendingCircleCenter.value = null;
  previewRadius.value = null;
  selectedCircleIndices.value = [];
  tangentCandidates.value = [];
  redraw();
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  const point = getCanvasCoordinates(event);

  if (activeTool.value === Tool.Circle) {
    event.preventDefault();
    handleCirclePointerDown(point);
    return;
  }

  if (activeTool.value === Tool.Tangent) {
    event.preventDefault();
    handleTangentPointerDown(point);
    return;
  }

  if (startCircleResize(event, point)) {
    event.preventDefault();
    return;
  }

  if (startCircleDrag(event, point)) {
    event.preventDefault();
  }
}

function handlePointerMove(event: PointerEvent) {
  if (resizingCircleIndex.value !== null) {
    event.preventDefault();
    const point = getCanvasCoordinates(event);
    updateResizedCircleRadius(point);
    return;
  }

  if (draggingCircleIndex.value !== null) {
    event.preventDefault();
    const point = getCanvasCoordinates(event);
    updateDraggedCirclePosition(point);
    return;
  }

  if (
    activeTool.value !== Tool.Circle ||
    !pendingCircleCenter.value
  ) {
    return;
  }

  const point = getCanvasCoordinates(event);
  previewRadius.value = distanceBetweenPoints(
    pendingCircleCenter.value,
    point,
  );
  redraw();
}

function handlePointerLeave(event: PointerEvent) {
  if (resizingCircleIndex.value !== null) {
    stopCircleResize(event);
  }

  if (draggingCircleIndex.value !== null) {
    stopCircleDrag(event);
  }

  if (!pendingCircleCenter.value) {
    return;
  }
  previewRadius.value = null;
  redraw();
}

function handlePointerUp(event: PointerEvent) {
  if (resizingCircleIndex.value !== null) {
    stopCircleResize(event);
  }

  if (draggingCircleIndex.value !== null) {
    stopCircleDrag(event);
  }
}

function handlePointerCancel(event: PointerEvent) {
  if (resizingCircleIndex.value !== null) {
    stopCircleResize(event);
  }

  if (draggingCircleIndex.value !== null) {
    stopCircleDrag(event);
  }
}

function handleCirclePointerDown(point: Point) {
  if (!pendingCircleCenter.value) {
    pendingCircleCenter.value = point;
    previewRadius.value = 0;
    redraw();
    return;
  }

  const radius = distanceBetweenPoints(pendingCircleCenter.value, point);
  if (radius <= 0) {
    return;
  }

  circles.value.push({
    center: pendingCircleCenter.value,
    radius,
  });

  pendingCircleCenter.value = null;
  previewRadius.value = null;
  deactivateTools();
}

function startCircleResize(event: PointerEvent, point: Point): boolean {
  const result = findCircleForResize(point);
  if (!result) {
    return false;
  }

  const { index, distanceToCenter } = result;
  const circle = circles.value[index];
  if (!circle) {
    return false;
  }

  resizingCircleIndex.value = index;
  resizeRadiusOffset.value = circle.radius - distanceToCenter;

  const canvas = canvasRef.value;
  if (canvas) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Игнорируем невозможность захвата указателя.
    }
  }

  return true;
}

function startCircleDrag(event: PointerEvent, point: Point): boolean {
  const circleIndex = findCircleAtPoint(point);
  if (circleIndex === -1) {
    return false;
  }

  const circle = circles.value[circleIndex];
  if (!circle) {
    return false;
  }

  draggingCircleIndex.value = circleIndex;
  dragOffset.value = {
    x: circle.center.x - point.x,
    y: circle.center.y - point.y,
  };

  const canvas = canvasRef.value;
  if (canvas) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Игнорируем невозможность захвата указателя.
    }
  }

  return true;
}

function updateDraggedCirclePosition(point: Point) {
  const index = draggingCircleIndex.value;
  const offset = dragOffset.value;
  if (index === null || !offset) {
    return;
  }

  const circle = circles.value[index];
  if (!circle) {
    return;
  }

  const newCenter = {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };

  circles.value[index] = {
    ...circle,
    center: newCenter,
  };

  recalculateTangentsForCircle(index);
  redraw();
}

function updateResizedCircleRadius(point: Point) {
  const index = resizingCircleIndex.value;
  if (index === null) {
    return;
  }

  const circle = circles.value[index];
  if (!circle) {
    return;
  }

  const distanceToCenter = distanceBetweenPoints(point, circle.center);
  const newRadius = Math.max(
    4,
    distanceToCenter + resizeRadiusOffset.value,
  );

  circles.value[index] = {
    ...circle,
    radius: newRadius,
  };

  recalculateTangentsForCircle(index);
  redraw();
}

function stopCircleDrag(event?: PointerEvent) {
  const canvas = canvasRef.value;
  if (canvas && event) {
    try {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch (error) {
      // Игнорируем невозможность освобождения указателя.
    }
  }

  draggingCircleIndex.value = null;
  dragOffset.value = null;
}

function stopCircleResize(event?: PointerEvent) {
  const canvas = canvasRef.value;
  if (canvas && event) {
    try {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    } catch (error) {
      // Игнорируем невозможность освобождения указателя.
    }
  }

  resizingCircleIndex.value = null;
  resizeRadiusOffset.value = 0;
}

function handleTangentPointerDown(point: Point) {
  if (tangentCandidates.value.length > 0) {
    const candidateIndex = findTangentCandidateAtPoint(point);
    if (candidateIndex !== -1) {
      finalizeTangentSelection(candidateIndex);
      return;
    }
  }

  const circleIndex = findCircleAtPoint(point);
  if (circleIndex === -1) {
    return;
  }

  if (selectedCircleIndices.value.includes(circleIndex)) {
    return;
  }

  if (selectedCircleIndices.value.length >= 2) {
    selectedCircleIndices.value = [circleIndex];
    tangentCandidates.value = [];
    redraw();
    return;
  }

  selectedCircleIndices.value.push(circleIndex);

  if (selectedCircleIndices.value.length === 2) {
    const [firstIndex, secondIndex] = selectedCircleIndices.value;
    tangentCandidates.value = calculateInternalTangents([firstIndex, secondIndex]);
  }

  redraw();
}

function findCircleAtPoint(point: Point): number {
  const hitPadding = 6;
  for (let index = circles.value.length - 1; index >= 0; index -= 1) {
    const circle = circles.value[index];
    const distance = distanceBetweenPoints(point, circle.center);
    if (distance <= circle.radius + hitPadding) {
      return index;
    }
  }
  return -1;
}

function findCircleForResize(
  point: Point,
): { index: number; distanceToCenter: number } | null {
  const edgePadding = 10;

  for (let index = circles.value.length - 1; index >= 0; index -= 1) {
    const circle = circles.value[index];
    const distance = distanceBetweenPoints(point, circle.center);
    const innerThreshold = Math.max(circle.radius - 12, circle.radius * 0.45);

    if (distance < innerThreshold) {
      continue;
    }

    if (Math.abs(distance - circle.radius) <= edgePadding) {
      return { index, distanceToCenter: distance };
    }
  }

  return null;
}

function findTangentCandidateAtPoint(point: Point): number {
  const hitThreshold = 10;
  let closestIndex = -1;
  let closestDistance = hitThreshold;

  tangentCandidates.value.forEach(({ start, end }, index) => {
    const distance = distanceFromPointToSegment(point, start, end);
    if (distance <= closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function finalizeTangentSelection(candidateIndex: number) {
  const chosen = tangentCandidates.value[candidateIndex];
  if (!chosen) {
    return;
  }

  tangentSegments.value.push(chosen);
  tangentCandidates.value = [];
  selectedCircleIndices.value = [];
  activeTool.value = null;
  redraw();
}

function recalculateTangentsForCircle(circleIndex: number) {
  tangentSegments.value = tangentSegments.value
    .map((segment) => {
      if (!segment.circleIndices.includes(circleIndex)) {
        return segment;
      }
      return calculateTangentByOrientation(
        segment.circleIndices,
        segment.orientation,
      );
    })
    .filter((segment): segment is TangentSolution => segment !== null);

  if (
    selectedCircleIndices.value.length === 2 &&
    selectedCircleIndices.value.includes(circleIndex)
  ) {
    tangentCandidates.value = calculateInternalTangents([
      selectedCircleIndices.value[0],
      selectedCircleIndices.value[1],
    ]);
    return;
  }

  if (
    tangentCandidates.value.length > 0 &&
    tangentCandidates.value[0]?.circleIndices.includes(circleIndex)
  ) {
    tangentCandidates.value = calculateInternalTangents(
      tangentCandidates.value[0].circleIndices,
    );
  }
}

function calculateInternalTangents(
  circleIndices: [number, number],
): TangentSolution[] {
  const [firstIndex, secondIndex] = circleIndices;
  const firstCircle = circles.value[firstIndex];
  const secondCircle = circles.value[secondIndex];
  if (!firstCircle || !secondCircle) {
    return [];
  }

  const dx = secondCircle.center.x - firstCircle.center.x;
  const dy = secondCircle.center.y - firstCircle.center.y;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared === 0) {
    return [];
  }

  const distance = Math.sqrt(distanceSquared);
  const radiiSum = firstCircle.radius + secondCircle.radius;

  if (distance <= radiiSum) {
    return [];
  }

  const baseUnitX = dx / distance;
  const baseUnitY = dy / distance;
  const perpUnitX = -baseUnitY;
  const perpUnitY = baseUnitX;

  const normalizedSum = radiiSum / distance;
  const heightSquared = Math.max(0, 1 - normalizedSum * normalizedSum);
  const height = Math.sqrt(heightSquared);

  const orientations: TangentOrientation[] = height < 1e-6 ? [1] : [-1, 1];

  return orientations.map((orientation) => {
    const nx =
      baseUnitX * normalizedSum + orientation * perpUnitX * height;
    const ny =
      baseUnitY * normalizedSum + orientation * perpUnitY * height;

    return {
      circleIndices: [firstIndex, secondIndex],
      orientation,
      start: {
        x: firstCircle.center.x + nx * firstCircle.radius,
        y: firstCircle.center.y + ny * firstCircle.radius,
      },
      end: {
        x: secondCircle.center.x - nx * secondCircle.radius,
        y: secondCircle.center.y - ny * secondCircle.radius,
      },
    };
  });
}

function calculateTangentByOrientation(
  circleIndices: [number, number],
  orientation: TangentOrientation,
): TangentSolution | null {
  const tangents = calculateInternalTangents(circleIndices);
  return (
    tangents.find((candidate) => candidate.orientation === orientation) ?? null
  );
}

function distanceFromPointToSegment(
  point: Point,
  start: Point,
  end: Point,
): number {
  const segmentVectorX = end.x - start.x;
  const segmentVectorY = end.y - start.y;
  const segmentLengthSquared = segmentVectorX * segmentVectorX + segmentVectorY * segmentVectorY;

  if (segmentLengthSquared === 0) {
    return distanceBetweenPoints(point, start);
  }

  const t =
    ((point.x - start.x) * segmentVectorX +
      (point.y - start.y) * segmentVectorY) /
    segmentLengthSquared;
  const clampedT = Math.max(0, Math.min(1, t));

  const projection = {
    x: start.x + segmentVectorX * clampedT,
    y: start.y + segmentVectorY * clampedT,
  };

  return distanceBetweenPoints(point, projection);
}

function setCanvasSize() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function redraw() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  circles.value.forEach(({ center, radius }, index) => {
    const isSelected = selectedCircleIndices.value.includes(index);
    drawCircle({
      center,
      radius,
      strokeStyle: isSelected ? "#facc15" : "#38bdf8",
      fillStyle: isSelected
        ? "rgba(250, 204, 21, 0.16)"
        : "rgba(56, 189, 248, 0.12)",
      lineDash: isSelected ? [6, 6] : [],
      lineWidth: isSelected ? 3 : 2.5,
      alpha: 1,
    });
  });

  if (pendingCircleCenter.value && previewRadius.value !== null) {
    drawCircle({
      center: pendingCircleCenter.value,
      radius: previewRadius.value,
      strokeStyle: "rgba(226, 232, 240, 0.9)",
      fillStyle: "rgba(148, 163, 184, 0.18)",
      lineDash: [8, 6],
      lineWidth: 2,
      alpha: 0.8,
    });
  }

  tangentSegments.value.forEach(({ start, end }) => {
    drawLine({
      start,
      end,
      strokeStyle: "#34d399",
      lineDash: [],
      lineWidth: 3,
      alpha: 0.95,
    });
  });

  tangentCandidates.value.forEach(({ start, end }) => {
    drawLine({
      start,
      end,
      strokeStyle: "rgba(226, 232, 240, 0.9)",
      lineDash: [10, 6],
      lineWidth: 2.5,
      alpha: 0.9,
    });
  });
}

type DrawCircleOptions = {
  center: Point;
  radius: number;
  strokeStyle: string;
  fillStyle: string;
  lineDash: number[];
  lineWidth: number;
  alpha: number;
};

type DrawLineOptions = {
  start: Point;
  end: Point;
  strokeStyle: string;
  lineDash: number[];
  lineWidth: number;
  alpha: number;
};

function drawCircle({
  center,
  radius,
  strokeStyle,
  fillStyle,
  lineDash,
  lineWidth,
  alpha,
}: DrawCircleOptions) {
  if (!ctx || radius <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.setLineDash(lineDash);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = fillStyle;
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLine({
  start,
  end,
  strokeStyle,
  lineDash,
  lineWidth,
  alpha,
}: DrawLineOptions) {
  if (!ctx) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.setLineDash(lineDash);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

function distanceBetweenPoints(p1: Point, p2: Point) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

function getCanvasCoordinates(event: PointerEvent): Point {
  const canvas = canvasRef.value;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: auto 1fr;
  min-height: 100vh;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: #111827;
  color: #f9fafc;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}

.tool-button {
  appearance: none;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease,
    background-color 120ms ease;
}

.tool-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.35);
}

.tool-button--active {
  background: #38b2ac;
  border-color: #38b2ac;
  color: #0d1b2a;
  box-shadow: 0 12px 30px rgba(56, 178, 172, 0.35);
}

.canvas-area {
  position: relative;
  background: #0f172a;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.editor-canvas {
  flex: 1;
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}
</style>

