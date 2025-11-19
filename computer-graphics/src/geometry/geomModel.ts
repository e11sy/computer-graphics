// src/geometry/geomModel.ts
import { reactive, shallowRef } from 'vue'
import { loadGeom } from './geom'
import { drawGrid, drawAxes, type ProjectParams } from '@/renders/render2d'
import type { Ref } from 'vue'
import type { BaseFigure } from './figures/Figure'

// Optional helper type for constructible tools (polyline/contour...)
type ConstructibleFigure = BaseFigure & {
  start?: (p: { x: number; y: number }) => void
  addVertex?: (p: { x: number; y: number }) => void
  updatePreview?: (p: { x: number; y: number }) => void
  finish?: () => void
  cancel?: () => void
}

type FigureConstructor = new (...args: any[]) => BaseFigure

class GeometryModel {
  // wasm
  wasm: any | null = null

  // canvas + ctx
  canvas: HTMLCanvasElement | null = null
  ctx: CanvasRenderingContext2D | null = null

  // projection params
  params: ProjectParams = { k: 0, scale: 100, ox: 0, oy: 0 }

  // figures + registry
  figures: BaseFigure[] = []
  plugins = new Map<string, FigureConstructor>()

  // tool + construction state
  private activeTool: Ref<string | null> | null = null
  private activeConstruct: ConstructibleFigure | null = null
  private previewFigure: BaseFigure | null = null

  // reactive cursor + hover
  cursor = reactive({ x: 0, y: 0 }) // logical coords
  hoveredFigures = shallowRef<BaseFigure[]>([])
  private lastHovered = new Set<BaseFigure>()

  // listeners cleanup
  private cleanupFns: Array<() => void> = []
  private rafId: number | null = null

  // grid
  readonly SMALL_STEP = 0.1

  // --------------------------------------------------
  // Init / lifecycle
  // --------------------------------------------------
  async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    const mod = await loadGeom()
    this.wasm = mod

    this.resize()
    window.addEventListener('resize', this._boundResize)
    this.enableInteraction()
    this.loop()
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this._boundResize)
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
    this.previewFigure = null
    this.activeConstruct = null
    this.lastHovered.clear()
    this.hoveredFigures.value = []
  }

  // bindable resize fn (so we can remove listener correctly)
  private _boundResize = this.resize.bind(this)

  // --------------------------------------------------
  // Tool + plugins
  // --------------------------------------------------
  attachToolRef(toolRef: Ref<string | null>) {
    this.activeTool = toolRef
  }

  registerPlugin(type: string, ctor: FigureConstructor) {
    this.plugins.set(type, ctor)
  }

  addFigure(fig: BaseFigure) {
    this.figures.push(fig)
  }

  createFigure(type: string, ...args: any[]) {
    const ctor = this.plugins.get(type)
    if (!ctor) throw new Error(`Unknown figure type: ${type}`)
    const fig = new ctor(...args)
    this.addFigure(fig)
    return fig
  }

  // --------------------------------------------------
  // Coordinates + snapping
  // --------------------------------------------------
  private pxToLogical(px: number, py: number) {
    return {
      x: (px - this.params.ox) / this.params.scale,
      y: (this.params.oy - py) / this.params.scale,
    }
  }

  // Your stabilized snap with ±5 px bias
  private snapToGrid(px: number, py: number) {
    const stepPx = this.params.scale * this.SMALL_STEP
    const gx = Math.round((px - 5 - this.params.ox) / stepPx) * stepPx + this.params.ox + 5
    const gy = Math.round((py - 5 - this.params.oy) / stepPx) * stepPx + this.params.oy + 5
    return { cx: gx, cy: gy }
  }

  // --------------------------------------------------
  // Interaction
  // --------------------------------------------------
  enableInteraction() {
    if (!this.canvas) return
    const canvas = this.canvas

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      this.handleClick(px, py)
    }

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      this.handleMouseMove(px, py)
    }

    const onKey = (e: KeyboardEvent) => this.handleKeyDown(e)

    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', onKey)

    this.cleanupFns.push(() => canvas.removeEventListener('click', onClick))
    this.cleanupFns.push(() => canvas.removeEventListener('mousemove', onMove))
    this.cleanupFns.push(() => window.removeEventListener('keydown', onKey))

    // prevent context menu (optional)
    const onCtx = (e: MouseEvent) => e.preventDefault()
    canvas.addEventListener('contextmenu', onCtx)
    this.cleanupFns.push(() => canvas.removeEventListener('contextmenu', onCtx))
  }

  private handleMouseMove(px: number, py: number) {
    const { cx, cy } = this.snapToGrid(px, py)
    const { x, y } = this.pxToLogical(cx, cy)

    // update reactive cursor
    this.cursor.x = x
    this.cursor.y = y

    // hover detection (screen-space hit tests)
    const hoveredNow = new Set<BaseFigure>()
    for (const fig of this.figures) {
      if (fig.hitTest && fig.hitTest(px, py, this.params)) {
        hoveredNow.add(fig)
        if (!this.lastHovered.has(fig)) {
          fig.isHovered = true
          fig.hoverStart?.()
        }
      }
    }
    // hover end for those no longer hovered
    for (const fig of this.lastHovered) {
      if (!hoveredNow.has(fig)) {
        fig.isHovered = false
        fig.hoverEnd?.()
      }
    }
    this.lastHovered = hoveredNow
    this.hoveredFigures.value = [...hoveredNow]

    // tool preview
    const tool = this.activeTool?.value
    if (!tool) {
      this.previewFigure = null
      return
    }

    // If constructing now, update the current constructible figure preview
    if (this.activeConstruct?.updatePreview) {
      this.activeConstruct.updatePreview({ x, y })
      this.previewFigure = null
      return
    }

    // If not constructing: show preview for simple tools only (no start())
    const ctor = this.plugins.get(tool)
    if (!ctor) {
      this.previewFigure = null
      return
    }
    const proto = ctor.prototype as any
    const isConstructible = typeof proto.start === 'function'
    if (!isConstructible) {
      // simple: constructor expects (x, y)
      this.previewFigure = new ctor(x, y, true)
    } else {
      // constructible but not started -> no preview instance (optional: draw crosshair)
      this.previewFigure = null
    }
  }

  private handleClick(px: number, py: number) {
    const tool = this.activeTool?.value
    if (!tool) return

    const { cx, cy } = this.snapToGrid(px, py)
    const { x, y } = this.pxToLogical(cx, cy)

    // If a constructible figure is in progress: keep building it
    if (this.activeConstruct) {
      const fig = this.activeConstruct
      if ((fig as any).points?.length === 0 && fig.start) fig.start({ x, y })
      else if (fig.addVertex) fig.addVertex({ x, y })
      return
    }

    // Otherwise start/place a new figure for the active tool
    const ctor = this.plugins.get(tool)
    if (!ctor) return
    const proto = ctor.prototype as any
    const isConstructible = typeof proto.start === 'function'

    if (isConstructible) {
      // no-arg constructor; then start at click
      const instance = new ctor() as ConstructibleFigure
      this.activeConstruct = instance
      this.figures.push(instance)
      instance.start?.({ x, y })
      this.previewFigure = null
    } else {
      const instance = new ctor(x, y) as BaseFigure
      this.figures.push(instance)
      // regenerate preview (transparent one stays under cursor)
      this.previewFigure = new ctor(x, y, true)
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.activeConstruct) return
    if (e.key === 'Enter') {
      this.activeConstruct.finish?.()
      this.activeConstruct = null
      this.previewFigure = null
    }
    else if (e.key === 'Escape') {
      this.activeConstruct.cancel?.()
      this.activeConstruct = null
      this.previewFigure = null
    }
  }

  // --------------------------------------------------
  // Rendering
  // --------------------------------------------------
  render() {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return

    // clear + background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawGrid(ctx, canvas.width, canvas.height, this.params)
    drawAxes(ctx, canvas.width, canvas.height, this.params)

    // figures
    for (const fig of this.figures) {
      fig.draw(ctx, this.params)
    }

    // preview (semi-transparent)
    if (this.previewFigure) {
      ctx.save()
      ctx.globalAlpha = 0.4
      this.previewFigure.draw(ctx, this.params)
      ctx.restore()
    }
  }

  private loop() {
    this.render()
    this.rafId = requestAnimationFrame(this.loop.bind(this))
  }

  // --------------------------------------------------
  // Resize
  // --------------------------------------------------
  resize() {
    if (!this.canvas || !this.ctx) return
    const w = this.canvas.parentElement!.clientWidth
    const h = Math.max(320, this.canvas.parentElement!.clientHeight || 480)

    this.canvas.width = Math.floor(w * devicePixelRatio)
    this.canvas.height = Math.floor(h * devicePixelRatio)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`

    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    this.params.ox = this.canvas.width / 2
    this.params.oy = this.canvas.height / 2
  }
}

// Singleton
export const geometryModel = new GeometryModel()
export default geometryModel
