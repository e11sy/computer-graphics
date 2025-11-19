<template>
  <div class="card">
    <header class="header">
      <div>
        <h1>Билинейная поверхность</h1>
        <p class="subtitle">
          Задайте координаты четырёх граничных точек. Поверните поверхность с
          помощью регуляторов вращения вокруг осей X и Y.
        </p>
      </div>
      <button class="reset-button" type="button" @click="resetDefaults">
        Сброс
      </button>
    </header>

    <section class="controls">
      <h2>Граничные точки</h2>
      <div class="controls-group">
        <div
          v-for="corner in cornerList"
          :key="corner.key"
          class="controls-block"
        >
          <h3>{{ corner.label }}</h3>
          <div class="input-row">
            <label :for="`${corner.key}-x`">X</label>
            <input
              :id="`${corner.key}-x`"
              type="number"
              step="0.1"
              v-model.number="corners[corner.key].x"
            />
          </div>
          <div class="input-row">
            <label :for="`${corner.key}-y`">Y</label>
            <input
              :id="`${corner.key}-y`"
              type="number"
              step="0.1"
              v-model.number="corners[corner.key].y"
            />
          </div>
          <div class="input-row">
            <label :for="`${corner.key}-z`">Z</label>
            <input
              :id="`${corner.key}-z`"
              type="number"
              step="0.1"
              v-model.number="corners[corner.key].z"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="controls">
      <h2>Вращение</h2>
      <div class="controls-group">
        <div class="controls-block">
          <label for="rotation-x">
            Угол вокруг X: <span>{{ rotationX.toFixed(1) }}°</span>
          </label>
          <input
            id="rotation-x"
            type="range"
            min="-180"
            max="180"
            step="1"
            v-model.number="rotationX"
          />
        </div>
        <div class="controls-block">
          <label for="rotation-y">
            Угол вокруг Y: <span>{{ rotationY.toFixed(1) }}°</span>
          </label>
          <input
            id="rotation-y"
            type="range"
            min="-180"
            max="180"
            step="1"
            v-model.number="rotationY"
          />
        </div>
      </div>
    </section>

    <div
      class="canvas-wrapper"
      @pointerdown="startDrag"
      @pointerup="stopDrag"
      @pointerleave="stopDrag"
      @pointermove="onDrag"
    >
      <canvas ref="canvasRef" class="surface-canvas"></canvas>
      <div class="hint">Потяните поверхность, чтобы повернуть</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watchEffect
} from 'vue';

type CornerKey = 'p00' | 'p10' | 'p01' | 'p11';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

const defaultCorners: Record<CornerKey, Vec3> = {
  p00: { x: -1.5, y: -1.2, z: -0.4 },
  p10: { x: 1.3, y: -1.4, z: 0.8 },
  p01: { x: -1.2, y: 1.1, z: 0.6 },
  p11: { x: 1.6, y: 1.4, z: -0.9 }
};

const cornerList = [
  { key: 'p00' as const, label: 'P₀₀ (u=0, v=0)' },
  { key: 'p10' as const, label: 'P₁₀ (u=1, v=0)' },
  { key: 'p01' as const, label: 'P₀₁ (u=0, v=1)' },
  { key: 'p11' as const, label: 'P₁₁ (u=1, v=1)' }
];

const corners = reactive<Record<CornerKey, Vec3>>(
  JSON.parse(JSON.stringify(defaultCorners))
);

const rotationX = ref(28);
const rotationY = ref(-32);
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0, rotX: 0, rotY: 0 });

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const resolution = 28;

const span = computed(() => {
  const ranges = ['x', 'y', 'z'].map((axis) => {
    const axisValues = cornerList.map(
      (corner) => corners[corner.key][axis as keyof Vec3]
    );
    const min = Math.min(...axisValues);
    const max = Math.max(...axisValues);
    return max - min;
  });

  return Math.max(...ranges, 1);
});

const bilinear = (u: number, v: number): Vec3 => {
  const p00 = corners.p00;
  const p10 = corners.p10;
  const p01 = corners.p01;
  const p11 = corners.p11;

  return {
    x:
      (1 - u) * (1 - v) * p00.x +
      u * (1 - v) * p10.x +
      (1 - u) * v * p01.x +
      u * v * p11.x,
    y:
      (1 - u) * (1 - v) * p00.y +
      u * (1 - v) * p10.y +
      (1 - u) * v * p01.y +
      u * v * p11.y,
    z:
      (1 - u) * (1 - v) * p00.z +
      u * (1 - v) * p10.z +
      (1 - u) * v * p01.z +
      u * v * p11.z
  };
};

const rotatePoint = (point: Vec3): Vec3 => {
  const radX = (rotationX.value * Math.PI) / 180;
  const radY = (rotationY.value * Math.PI) / 180;

  const cosX = Math.cos(radX);
  const sinX = Math.sin(radX);
  const cosY = Math.cos(radY);
  const sinY = Math.sin(radY);

  // Ротация вокруг оси X
  const y1 = point.y * cosX - point.z * sinX;
  const z1 = point.y * sinX + point.z * cosX;

  // Ротация вокруг оси Y
  const x2 = point.x * cosY + z1 * sinY;
  const z2 = -point.x * sinY + z1 * cosY;

  return { x: x2, y: y1, z: z2 };
};

const getContext = (): CanvasRenderingContext2D | null => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth || canvas.width;
  const displayHeight = canvas.clientHeight || canvas.height;

  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(dpr, dpr);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  return context;
};

const drawSurface = () => {
  const context = ctx;
  const canvas = canvasRef.value;

  if (!context || !canvas) {
    return;
  }

  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const scaleFactor = (Math.min(width, height) * 0.42) / span.value;

  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(148, 163, 184, 0.22)');
  gradient.addColorStop(1, 'rgba(15, 23, 42, 0.05)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const rows: ProjectedPoint[][] = [];
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;

  for (let i = 0; i <= resolution; i += 1) {
    const u = i / resolution;
    const row: ProjectedPoint[] = [];

    for (let j = 0; j <= resolution; j += 1) {
      const v = j / resolution;
      const rotated = rotatePoint(bilinear(u, v));

      minDepth = Math.min(minDepth, rotated.z);
      maxDepth = Math.max(maxDepth, rotated.z);

      row.push({
        x: width / 2 + rotated.x * scaleFactor,
        y: height / 2 - rotated.y * scaleFactor,
        depth: rotated.z
      });
    }

    rows.push(row);
  }

  const depthRange = maxDepth - minDepth || 1;

  const strokeForDepth = (depth: number) => {
    const t = (depth - minDepth) / depthRange;
    const opacity = 0.25 + (1 - t) * 0.55;
    const hue = 210 - t * 40;
    return `hsla(${hue}, 86%, ${60 - t * 15}%, ${opacity})`;
  };

  context.lineWidth = 1.4;

  // Горизонтальные линии
  rows.forEach((row) => {
    context.beginPath();
    row.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    const averageDepth =
      row.reduce((acc, point) => acc + point.depth, 0) / row.length;
    context.strokeStyle = strokeForDepth(averageDepth);
    context.stroke();
  });

  // Вертикальные линии
  for (let col = 0; col <= resolution; col += 1) {
    context.beginPath();
    let avgDepth = 0;
    for (let row = 0; row <= resolution; row += 1) {
      const point = rows[row][col];
      avgDepth += point.depth;
      if (row === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }
    avgDepth /= resolution + 1;
    context.strokeStyle = strokeForDepth(avgDepth);
    context.stroke();
  }

  // Граничные точки
  context.fillStyle = '#1d4ed8';
  const radius = 4;
  cornerList.forEach((corner) => {
    const point = rotatePoint(corners[corner.key]);
    const projected = {
      x: width / 2 + point.x * scaleFactor,
      y: height / 2 - point.y * scaleFactor
    };
    context.beginPath();
    context.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    context.fill();
  });
};

const handleResize = () => {
  ctx = getContext();
  drawSurface();
};

const resetDefaults = () => {
  Object.entries(defaultCorners).forEach(([key, value]) => {
    const typedKey = key as CornerKey;
    corners[typedKey].x = value.x;
    corners[typedKey].y = value.y;
    corners[typedKey].z = value.z;
  });
  rotationX.value = 28;
  rotationY.value = -32;
  nextTick(() => drawSurface());
};

const startDrag = (event: PointerEvent) => {
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX,
    y: event.clientY,
    rotX: rotationX.value,
    rotY: rotationY.value
  };
};

const stopDrag = (event: PointerEvent) => {
  if (isDragging.value) {
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  }
  isDragging.value = false;
};

const onDrag = (event: PointerEvent) => {
  if (!isDragging.value) {
    return;
  }
  const deltaX = event.clientX - dragStart.value.x;
  const deltaY = event.clientY - dragStart.value.y;
  rotationY.value = dragStart.value.rotY + deltaX * 0.4;
  rotationX.value = dragStart.value.rotX - deltaY * 0.4;
};

onMounted(() => {
  ctx = getContext();
  drawSurface();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});

watchEffect(() => {
  cornerList.forEach((corner) => {
    const point = corners[corner.key];
    void point.x;
    void point.y;
    void point.z;
  });
  void rotationX.value;
  void rotationY.value;
  void span.value;

  if (!ctx) {
    return;
  }

  drawSurface();
});
</script>

<style scoped>
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

h1 {
  margin: 0;
  font-size: 1.85rem;
}

h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e293b;
}

h3 {
  margin: 0 0 6px;
  font-size: 0.95rem;
  color: #1e293b;
}

.subtitle {
  margin: 6px 0 0;
  color: #475569;
  max-width: 540px;
}

.controls {
  margin-bottom: 28px;
}

.input-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reset-button {
  border: none;
  background: #1d4ed8;
  color: white;
  border-radius: 999px;
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.2s ease, transform 0.2s ease;
}

.reset-button:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  margin-top: 16px;
  padding: 16px;
  background: linear-gradient(140deg, rgba(59, 130, 246, 0.08), transparent);
}

.surface-canvas {
  width: 100%;
  height: 520px;
  display: block;
  border-radius: 12px;
  background: transparent;
}

.hint {
  position: absolute;
  bottom: 16px;
  right: 24px;
  background: rgba(15, 23, 42, 0.72);
  color: white;
  font-size: 0.75rem;
  padding: 6px 12px;
  border-radius: 999px;
  pointer-events: none;
}

@media (max-width: 720px) {
  .header {
    flex-direction: column;
    align-items: stretch;
  }

  .surface-canvas {
    height: 400px;
  }
}
</style>

