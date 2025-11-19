import { BaseFigure } from './Figure'
import type { ProjectParams } from '@/renders/render2d'

export class ContourFigure extends BaseFigure {
  points: { x: number; y: number }[] = []
  previewPoint: { x: number; y: number } | null = null
  isClosed = false

  constructor() {
    super('contour')
  }

  start(p: { x: number; y: number }) {
    console.log('started');
    this.points = [p]
    this.isClosed = false
  }

  addVertex(p: { x: number; y: number }) {
    if (this.isClosed) return
    this.points.push(p)
  }

  updatePreview(p: { x: number; y: number }) {
    this.previewPoint = p
  }

  finish() {
    if (this.points.length >= 3) {
      this.points.push(this.points[0])
      this.isClosed = true
    }
    this.previewPoint = null
  }

  cancel() {
    this.points = []
    this.previewPoint = null
    this.isClosed = false
  }

  draw(ctx: CanvasRenderingContext2D, params: ProjectParams) {
    if (this.points.length < 1) return
    const toPx = (p: { x: number; y: number }) => ({
      cx: params.ox + p.x * params.scale,
      cy: params.oy - p.y * params.scale,
    })

    ctx.save()
    ctx.beginPath()
    const first = toPx(this.points[0])
    ctx.moveTo(first.cx, first.cy)
    for (let i = 1; i < this.points.length; i++) {
      const p = toPx(this.points[i])
      ctx.lineTo(p.cx, p.cy)
    }

    // Draw preview edge
    if (this.previewPoint && !this.isClosed) {
      const prev = toPx(this.points[this.points.length - 1])
      const ghost = toPx(this.previewPoint)
      ctx.lineTo(ghost.cx, ghost.cy)
    }

    if (this.isClosed) ctx.closePath()

    // Fill + stroke
    if (this.isClosed) {
      ctx.fillStyle = 'rgba(30,136,229,0.3)'
      ctx.fill()
    }
    ctx.strokeStyle = '#1e88e5'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }
}
