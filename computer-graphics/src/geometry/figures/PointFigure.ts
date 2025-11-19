import { BaseFigure } from './Figure'
import type { ProjectParams } from '@/renders/render2d'

export class PointFigure extends BaseFigure {
  x: number
  y: number
  isPreview = false // <== new flag

  private targetScale = 1
  private currentScale = 1
  private targetAlpha = 1
  private currentAlpha = 1

  private readonly baseRadius = 5
  private readonly hoverScale = 1.5
  private readonly hoverAlpha = 0.5
  private readonly ease = 0.12

  constructor(x: number, y: number, isPreview = false) {
    super('point')
    this.x = x
    this.y = y
    this.isPreview = isPreview
    if (isPreview) {
      this.currentAlpha = 0.4
      this.targetAlpha = 0.4
    }
  }

  draw(ctx: CanvasRenderingContext2D, params: ProjectParams) {
    this.currentScale += (this.targetScale - this.currentScale) * this.ease
    this.currentAlpha += (this.targetAlpha - this.currentAlpha) * this.ease

    const r = this.baseRadius * this.currentScale
    const cx = params.ox + this.x * params.scale - 0.05
    const cy = params.oy - this.y * params.scale - 0.25

    ctx.save()
    ctx.globalAlpha = this.isPreview ? 0.4 : this.currentAlpha
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#1e88e5'
    ctx.fill()
    ctx.restore()
  }

  hitTest(px: number, py: number, params: ProjectParams): boolean {
    const cx = params.ox + this.x * params.scale
    const cy = params.oy - this.y * params.scale
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy < (this.baseRadius * 2) ** 2
  }

  hoverStart() {
    if (this.isPreview) return
    this.isHovered = true
    this.targetScale = this.hoverScale
    this.targetAlpha = this.hoverAlpha
  }

  hoverEnd() {
    if (this.isPreview) return
    this.isHovered = false
    this.targetScale = 1
    this.targetAlpha = 1
  }
}
