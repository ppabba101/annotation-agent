export type ToolType = 'select' | 'highlight' | 'pen' | 'circle' | 'arrow' | 'underline';

export interface CanvasLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  objects: string[]; // fabric object IDs
}

export interface AnnotationObject {
  id: string;
  type: 'highlight' | 'pen' | 'circle' | 'arrow' | 'underline' | 'text';
  layerId: string;
  fabricData: string; // JSON representation of fabric object
  createdAt: string;
}

export interface ViewportTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}
