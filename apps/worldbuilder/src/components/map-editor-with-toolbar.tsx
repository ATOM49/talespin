'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridCell, WorldGrid, TRelCoord } from '@talespin/schema';
import {
  Canvas as FabricCanvas,
  Circle as FabricCircle,
  type TPointerEventInfo,
} from 'fabric';
import { FabricGrid } from '@/components/FabricGrid/FabricGrid';
import type { GridCellVisual } from '@/components/FabricGrid/types';
import { useGridStore, type GridState } from '@/state/useGridStore';
import { useGridSync } from '@/components/map-common/useGridSync';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import type { Tool } from '@/components/map-toolbox';

interface RelativeShape {
  id: string;
  type: 'dot';
  points: TRelCoord[];
}

interface MapEditorWithToolbarProps {
  imageUrl: string;
  grid?: {
    grid: Pick<WorldGrid, '_id' | 'width' | 'height' | 'homeCellId'>;
    cells: GridCell[];
  };
  activeCellId?: string | null;
  selectedCellIds?: string[];
  showGrid?: boolean;
  cellVisuals?: Record<number, GridCellVisual>;
  onCellClick?: (cell: GridCell) => void;
  onCellSelected?: (cell: GridCell | null) => void;
  onCellsSelected?: (cells: GridCell[]) => void;
  onLocationCreated?: (
    coordRel: { u: number; v: number },
    cell?: GridCell,
  ) => void;
  renderCellDetails?: (cell: GridCell, onClose: () => void) => React.ReactNode;
}

export function MapEditorWithToolbar({
  imageUrl,
  grid,
  activeCellId,
  selectedCellIds,
  showGrid = true,
  cellVisuals,
  onCellClick,
  onCellSelected,
  onCellsSelected,
  onLocationCreated,
  renderCellDetails,
}: MapEditorWithToolbarProps) {
  const [tool, setTool] = useState<Tool>('select');
  const [shapes, setShapes] = useState<RelativeShape[]>([]);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const shapeObjectsRef = useRef<Record<string, FabricCircle>>({});

  const setInteractionMode = useGridStore(
    (state: GridState) => state.setInteractionMode,
  );

  const {
    handleGridSelection: hookHandleGridSelection,
    handleCanvasReady: hookHandleCanvasReady,
  } = useGridSync({
    imageUrl,
    grid,
    activeCellId,
    selectedCellIds,
    showGrid,
    onCellClick,
    onCellSelected,
    onCellsSelected,
  });

  useEffect(() => {
    const mode = tool === 'location' ? 'location' : 'grid';
    setInteractionMode(mode);
  }, [setInteractionMode, tool]);

  const resolveCellFromRelative = useCallback(
    (point: TRelCoord): GridCell | undefined => {
      if (!grid) return undefined;
      const clampedX = Math.max(
        0,
        Math.min(grid.grid.width - 1, Math.floor(point.u * grid.grid.width)),
      );
      const clampedY = Math.max(
        0,
        Math.min(grid.grid.height - 1, Math.floor(point.v * grid.grid.height)),
      );
      return grid.cells.find(
        (cell) => cell.x === clampedX && cell.y === clampedY,
      );
    },
    [grid],
  );

  const handleGridSelection = hookHandleGridSelection;

  const toRelative = useCallback(
    (point: { x: number; y: number }): TRelCoord => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return { u: 0, v: 0 };
      const width = canvas.getWidth() || 1;
      const height = canvas.getHeight() || 1;
      return { u: point.x / width, v: point.y / height };
    },
    [],
  );

  const toAbsolute = useCallback((point: TRelCoord) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: point.u * (canvas.getWidth() || 1),
      y: point.v * (canvas.getHeight() || 1),
    };
  }, []);

  const redrawShapes = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    Object.values(shapeObjectsRef.current).forEach((shape) => {
      canvas.remove(shape);
    });
    shapeObjectsRef.current = {};

    shapes.forEach((shape) => {
      if (shape.points.length === 0) return;
      const absolutePoint = toAbsolute(shape.points[0]);
      const circle = new FabricCircle({
        left: absolutePoint.x - 4,
        top: absolutePoint.y - 4,
        radius: 4,
        fill: '#dc2626',
        selectable: false,
        evented: false,
      });
      shapeObjectsRef.current[shape.id] = circle;
      canvas.add(circle);
    });

    canvas.requestRenderAll();
  }, [shapes, toAbsolute]);

  useEffect(() => {
    redrawShapes();
  }, [redrawShapes]);

  const handleCanvasReady = useCallback(
    (canvas: FabricCanvas | null) => {
      hookHandleCanvasReady(canvas);
      if (canvas) {
        redrawShapes();
      }
    },
    [hookHandleCanvasReady, redrawShapes],
  );

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const handleLocationClick = (event: TPointerEventInfo) => {
      if (tool !== 'location') return;

      const pointer = event.pointer || { x: 0, y: 0 };
      const relative = toRelative(pointer);

      const newShape: RelativeShape = {
        id: crypto.randomUUID(),
        type: 'dot',
        points: [relative],
      };

      const circle = new FabricCircle({
        left: pointer.x - 4,
        top: pointer.y - 4,
        radius: 4,
        fill: '#dc2626',
        selectable: false,
        evented: false,
      });

      canvas.add(circle);
      shapeObjectsRef.current[newShape.id] = circle;
      setShapes((prev) => [...prev, newShape]);

      const targetCell = resolveCellFromRelative(relative);
      if (targetCell) {
        onCellSelected?.(targetCell);
      }

      onLocationCreated?.(relative, targetCell);

      setTool('select');
    };

    canvas.on('mouse:down', handleLocationClick);

    return () => {
      canvas.off('mouse:down', handleLocationClick);
    };
  }, [
    onLocationCreated,
    onCellSelected,
    resolveCellFromRelative,
    toRelative,
    tool,
  ]);

  const activeCell = useMemo(() => {
    if (!activeCellId || !grid) {
      return null;
    }
    return grid.cells.find((cell) => cell._id === activeCellId) || null;
  }, [activeCellId, grid]);

  const handleClearSelection = useCallback(() => {
    onCellSelected?.(null);
  }, [onCellSelected]);

  const isDrawerOpen = Boolean(activeCell);
  const handleDrawerOpenChange = (open: boolean) => {
    if (!open) {
      handleClearSelection();
    }
  };

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-gray-100">
        <FabricGrid
          className="h-full w-full"
          onCellSelect={handleGridSelection}
          onReady={handleCanvasReady}
          onBackgroundError={(error) =>
            console.error('Map image error:', error)
          }
          cellVisuals={cellVisuals}
        />
      </div>

      <Drawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerOpenChange}
        direction="right"
      >
        <DrawerContent className="w-full max-w-md border-l border-sidebar-border">
          <DrawerTitle className="sr-only">Movement cell details</DrawerTitle>
          <DrawerDescription className="sr-only">
            Inspect and edit the selected movement cell.
          </DrawerDescription>
          {activeCell &&
            renderCellDetails &&
            renderCellDetails(activeCell, handleClearSelection)}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
