export type ProjectParams = { k: number; scale: number; ox: number; oy: number };

// Draw checkered grid
export function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, params: ProjectParams) {
  const stepSmall = params.scale * 0.1;
  const stepBig = params.scale * 1.0;

  // small grid lines
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += stepSmall) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += stepSmall) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // big grid lines
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  for (let x = 0; x <= width; x += stepBig) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += stepBig) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

// Draw axes along major grid lines
export function drawAxes(ctx: CanvasRenderingContext2D, width: number, height: number, params: ProjectParams) {
  ctx.save();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;

  const stepBig = params.scale * 1.0;

  // X axis = bottom-most big grid line
  const yAxisPos = Math.floor(height / (stepBig * 2)) * stepBig;
  ctx.beginPath();
  ctx.moveTo(0, yAxisPos);
  ctx.lineTo(width, yAxisPos);
  ctx.stroke();

  // Y axis = left-most big grid line
  const xAxisPos = 1 * stepBig;
  ctx.beginPath();
  ctx.moveTo(xAxisPos, 0);
  ctx.lineTo(xAxisPos, height);
  ctx.stroke();

  ctx.restore();
}


function project(p: Float32Array, i: number, params: ProjectParams) {
  const x = p[i], y = p[i+1], z = p[i+2];
  const denom = 1 + z * params.k;
  return [
    params.ox + (x / denom) * params.scale,
    params.oy - (y / denom) * params.scale,
  ] as [number, number];
}

export function drawPolyline(ctx: CanvasRenderingContext2D, pts: Float32Array, params: ProjectParams) {
  if (pts.length < 6) return;
  const [x0, y0] = project(pts, 0, params);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 3; i < pts.length; i += 3) {
    const [x, y] = project(pts, i, params);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawPoints(ctx: CanvasRenderingContext2D, pts: Float32Array, r: number, params: ProjectParams) {
  for (let i = 0; i < pts.length; i += 3) {
    const [x, y] = project(pts, i, params);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawMarker(ctx: CanvasRenderingContext2D, pos: Float32Array, size: number, params: ProjectParams) {
  const [x, y] = project(pos, 0, params);
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x - size * 0.6, y + size);
  ctx.lineTo(x + size * 0.6, y + size);
  ctx.closePath();
  ctx.fill();
}

export function drawTextLine(
  ctx: CanvasRenderingContext2D,
  start: Float32Array,
  end: Float32Array,
  text: string,
  params: ProjectParams
) {
  const [x0, y0] = project(start, 0, params);
  const [x1, y1] = project(end, 0, params);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, x1, y1 - 4);
}
