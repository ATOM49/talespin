import type { GridConfig } from '@talespin/schema';

export interface CanvasSize {
  width: number;
  height: number;
}

export const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const getCellIndex = (x: number, y: number, cellsX: number) =>
  y * cellsX + x;

export const pointerToCell = (
  pointer: { x: number; y: number },
  config: GridConfig,
  canvasSize: CanvasSize,
) => {
  const cellWidth = canvasSize.width / config.cellsX;
  const cellHeight = canvasSize.height / config.cellsY;
  const x = clamp(Math.floor(pointer.x / cellWidth), 0, config.cellsX - 1);
  const y = clamp(Math.floor(pointer.y / cellHeight), 0, config.cellsY - 1);
  return { x, y };
};

export const toRelativePoint = (
  pointer: { x: number; y: number },
  canvasSize: CanvasSize,
) => ({
  x: canvasSize.width ? pointer.x / canvasSize.width : 0,
  y: canvasSize.height ? pointer.y / canvasSize.height : 0,
});

export const toAbsolutePoint = (
  relative: { x: number; y: number },
  canvasSize: CanvasSize,
) => ({
  x: relative.x * canvasSize.width,
  y: relative.y * canvasSize.height,
});

export const cellBounds = (
  cell: { x: number; y: number },
  config: GridConfig,
  canvasSize: CanvasSize,
) => {
  const cellWidth = canvasSize.width / config.cellsX;
  const cellHeight = canvasSize.height / config.cellsY;
  return {
    left: cell.x * cellWidth,
    top: cell.y * cellHeight,
    width: cellWidth,
    height: cellHeight,
  };
};
