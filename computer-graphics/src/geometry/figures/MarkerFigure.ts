import { BaseFigure } from './Figure'
import type { ProjectParams } from '@/renders/render2d'

export class MarkerFigure extends BaseFigure {
  x: number
  y: number
  isPreview = false

  private targetScale = 1
  private currentScale = 1
  private targetAlpha = 1
  private currentAlpha = 1

  private readonly baseSize = 16
  private readonly hoverScale = 1.5
  private readonly hoverAlpha = 0.5
  private readonly ease = 0.12

  constructor(x: number, y: number, isPreview = false) {
    super('marker')
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

    const size = this.baseSize * this.currentScale
    const cx = params.ox + this.x * params.scale
    const cy = params.oy - this.y * params.scale

    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(size / 20, size / 20)
    ctx.globalAlpha = this.isPreview ? 0.4 : this.currentAlpha

    // --- marker shape ---
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(10, -10, 10, -20, 0, -20)
    ctx.bezierCurveTo(-10, -20, -10, -10, 0, 0)
    ctx.closePath()
    ctx.fillStyle = '#e53935'
    ctx.fill()
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1
    ctx.stroke()

    // --- white inner circle ---
    ctx.beginPath()
    ctx.arc(0, -12, 4, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()

    ctx.restore()
  }

  hitTest(px: number, py: number, params: ProjectParams): boolean {
    const cx = params.ox + this.x * params.scale
    const cy = params.oy - this.y * params.scale
    const size = this.baseSize * this.currentScale

    // Create an offscreen path for hit detection
    const path = new Path2D()
    path.moveTo(0, 0)
    path.bezierCurveTo(10, -10, 10, -20, 0, -20)
    path.bezierCurveTo(-10, -20, -10, -10, 0, 0)
    path.closePath()

    // Transform cursor position into local marker coordinates
    const localX = (px - cx) / (size / 20)
    const localY = (py - cy) / (size / 20)

    // use Canvas2D path hit-test
    const ctx = document.createElement('canvas').getContext('2d')!
    return ctx.isPointInPath(path, localX, localY)
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
