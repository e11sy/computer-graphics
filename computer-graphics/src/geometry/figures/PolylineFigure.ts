import { BaseFigure } from './Figure'
import type { ProjectParams } from '@/renders/render2d'

export class PolylineFigure extends BaseFigure {
  points: { x: number; y: number }[]
  isPreview = false

  private targetAlpha = 1
  private currentAlpha = 1
  private targetWidth = 2
  private currentWidth = 2

  private readonly hoverAlpha = 0.6
  private readonly hoverWidth = 3.5
  private readonly ease = 0.12
  private readonly hoverThreshold = 10 // px

  constructor(
    points: { x: number; y: number }[] | { x: number; y: number } = [],
    isPreview = false
  ) {
    super('polyline')

    // Normalize input to always be an array
    if (Array.isArray(points)) {
      this.points = points.filter(Boolean)
    } else if (points && typeof points === 'object' && 'x' in points && 'y' in points) {
      this.points = [points]
    } else {
      this.points = []
    }

    this.isPreview = isPreview
    if (isPreview) {
      this.currentAlpha = 0.4
      this.targetAlpha = 0.4
    }
  }

  draw(ctx: CanvasRenderingContext2D, params: ProjectParams) {
    if (!this.points || this.points.length === 0) return
  
    this.currentAlpha += (this.targetAlpha - this.currentAlpha) * this.ease
    this.currentWidth += (this.targetWidth - this.currentWidth) * this.ease
  
    ctx.save()
    ctx.globalAlpha = this.isPreview ? 0.4 : this.currentAlpha
    ctx.lineWidth = this.currentWidth
    ctx.strokeStyle = '#1e88e5'
  
    const first = this.points[0]
    if (!first) {
      ctx.restore()
      return
    }
  
    ctx.beginPath()
    ctx.moveTo(params.ox + first.x * params.scale, params.oy - first.y * params.scale)
  
    if (this.points.length === 1) {
      // draw a small dot so you see something even before the second click
      ctx.arc(params.ox + first.x * params.scale, params.oy - first.y * params.scale, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#1e88e5'
      ctx.fill()
    } else {
      for (let i = 1; i < this.points.length; i++) {
        const p = this.points[i]
        if (!p) continue
        ctx.lineTo(params.ox + p.x * params.scale, params.oy - p.y * params.scale)
      }
      ctx.stroke()
    }
  
    ctx.restore()
  }

  hitTest(px: number, py: number, params: ProjectParams): boolean {
    if (!this.points || this.points.length < 2) return false
    let minDist = Infinity

    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]
      const b = this.points[i + 1]
      if (!a || !b) continue

      const ax = params.ox + a.x * params.scale
      const ay = params.oy - a.y * params.scale
      const bx = params.ox + b.x * params.scale
      const by = params.oy - b.y * params.scale
      const d = this.distanceToSegment(px, py, ax, ay, bx, by)
      if (d < minDist) minDist = d
    }

    return minDist <= this.hoverThreshold
  }

  private distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const vx = x2 - x1
    const vy = y2 - y1
    const len2 = vx * vx + vy * vy
    if (len2 === 0) return Math.hypot(px - x1, py - y1)
    let t = ((px - x1) * vx + (py - y1) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    const projx = x1 + t * vx
    const projy = y1 + t * vy
    return Math.hypot(px - projx, py - projy)
  }

  hoverStart() {
    if (this.isPreview) return
    this.isHovered = true
    this.targetAlpha = this.hoverAlpha
    this.targetWidth = this.hoverWidth
  }

  hoverEnd() {
    if (this.isPreview) return
    this.isHovered = false
    this.targetAlpha = 1
    this.targetWidth = 2
  }
}
