// src/geometry/registerFigures.ts
import geometryModel from './geomModel'
import { PointFigure } from './figures/PointFigure'
import { ContourFigure } from './figures/ContourFigure'
import { PolylineFigure } from './figures/PolylineFigure'
import { MarkerFigure } from './figures/MarkerFigure'

export function registerDefaultFigures() {
  geometryModel.registerPlugin('point', PointFigure)
  geometryModel.registerPlugin('polyline', PolylineFigure)
  geometryModel.registerPlugin('contour', ContourFigure)
  geometryModel.registerPlugin('marker', MarkerFigure)
}
