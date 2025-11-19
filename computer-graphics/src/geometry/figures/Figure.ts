import type { ProjectParams } from '@/renders/render2d'

export interface Figure {
  id: string
  type: string
  draw(ctx: CanvasRenderingContext2D, params: ProjectParams): void
  hover?(mx: number, my: number, params: ProjectParams): boolean
}

export interface ConstructibleFigure extends Figure {
  /** lifecycle methods for multi-step tools */
  start(point: { x: number; y: number }): void
  addVertex?(point: { x: number; y: number }): void
  updatePreview?(point: { x: number; y: number }): void
  finish?(): void
  cancel?(): void
  previewPoint?: { x: number; y: number } | null
}

export abstract class BaseFigure {
  type: string
  isHovered = false

  constructor(type: string) {
    this.type = type
  }

  abstract draw(ctx: CanvasRenderingContext2D, params: ProjectParams): void

  /** called by the model to test if the cursor hits this figure */
  hitTest?(px: number, py: number, params: ProjectParams): boolean

  /** optional reactions */
  hoverStart?(): void
  hoverEnd?(): void
}
