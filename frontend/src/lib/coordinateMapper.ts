export interface Point2D {
  x: number;
  y: number;
}

export class CoordinateMapper {
  constructor(
    public pdfRenderScale: number,
    public bgImageScale: number,
  ) {}

  canvasToPdfPixel(point: Point2D): Point2D {
    return {
      x: point.x / this.bgImageScale,
      y: point.y / this.bgImageScale,
    };
  }

  pdfPixelToCanvas(point: Point2D): Point2D {
    return {
      x: point.x * this.bgImageScale,
      y: point.y * this.bgImageScale,
    };
  }
}
