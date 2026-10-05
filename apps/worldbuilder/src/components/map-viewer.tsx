'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { FabricGrid } from '@/components/FabricGrid/FabricGrid';
import type { GridCellVisual } from '@/components/FabricGrid/types';
import { useGridSync } from '@/components/map-common/useGridSync';
import type { GridCell, WorldGrid } from '@talespin/schema';

interface MapViewerProps {
  imageUrl: string;
  grid?: {
    grid: Pick<WorldGrid, '_id' | 'width' | 'height' | 'homeCellId'>;
    cells: GridCell[];
  };
  activeCellId?: string | null;
  selectedCellIds?: string[];
  onCellClick?: (cell: GridCell) => void;
  onCellSelected?: (cell: GridCell | null) => void;
  onCellsSelected?: (cells: GridCell[]) => void;
  showGrid?: boolean;
  fogEnabled?: boolean;
  homeCellId?: string;
  revealedCellIds?: string[];
  cellVisuals?: Record<number, GridCellVisual>;
  revealOnSelect?: boolean;
  floatingCellId?: string | null;
  floatingContent?: ReactNode;
  highlightCellId?: string | null;
}

interface FloatingAnchor {
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

interface CellHighlightBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

const EMPTY_REVEALED_CELL_IDS: string[] = [];

export function MapViewer({
  imageUrl,
  grid,
  activeCellId,
  selectedCellIds,
  onCellClick,
  onCellSelected,
  onCellsSelected,
  showGrid = true,
  fogEnabled = false,
  homeCellId,
  revealedCellIds = EMPTY_REVEALED_CELL_IDS,
  cellVisuals,
  revealOnSelect = true,
  floatingCellId,
  floatingContent,
  highlightCellId,
}: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resolvedHomeCellId = homeCellId ?? grid?.grid.homeCellId ?? null;
  const gridId = grid?.grid._id ?? null;
  const [internalRevealed, setInternalRevealed] = useState<string[]>([]);
  const previousGridIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!fogEnabled) {
      previousGridIdRef.current = gridId;
      setInternalRevealed([]);
      return;
    }
    if (gridId && previousGridIdRef.current !== gridId) {
      previousGridIdRef.current = gridId;
      setInternalRevealed(resolvedHomeCellId ? [resolvedHomeCellId] : []);
      return;
    }
    if (!gridId) {
      previousGridIdRef.current = null;
      setInternalRevealed(resolvedHomeCellId ? [resolvedHomeCellId] : []);
      return;
    }
    if (resolvedHomeCellId) {
      setInternalRevealed((prev) => {
        if (prev.includes(resolvedHomeCellId)) {
          return prev;
        }
        return [...prev, resolvedHomeCellId];
      });
    }
  }, [fogEnabled, gridId, resolvedHomeCellId]);

  const revealCells = useCallback(
    (cells?: GridCell | GridCell[] | null) => {
      if (!fogEnabled || !revealOnSelect || !cells) return;
      const list = Array.isArray(cells) ? cells : [cells];
      if (!list.length) return;
      setInternalRevealed((prev) => {
        const next = new Set(prev);
        list.forEach((cell) => {
          if (cell?._id) {
            next.add(cell._id);
          }
        });
        return Array.from(next);
      });
    },
    [fogEnabled, revealOnSelect],
  );

  const handleFogAwareCellClick = useCallback(
    (cell: GridCell) => {
      revealCells(cell);
      onCellClick?.(cell);
    },
    [onCellClick, revealCells],
  );

  const handleFogAwareCellSelected = useCallback(
    (cell: GridCell | null) => {
      if (cell) {
        revealCells(cell);
      }
      onCellSelected?.(cell);
    },
    [onCellSelected, revealCells],
  );

  const handleFogAwareCellsSelected = useCallback(
    (cells: GridCell[]) => {
      revealCells(cells);
      onCellsSelected?.(cells);
    },
    [onCellsSelected, revealCells],
  );

  const { fabricCanvasRef, handleGridSelection, handleCanvasReady } =
    useGridSync({
      imageUrl,
      grid,
      activeCellId,
      selectedCellIds,
      showGrid,
      interactionMode: 'grid',
      onCellClick: handleFogAwareCellClick,
      onCellSelected: handleFogAwareCellSelected,
      onCellsSelected: handleFogAwareCellsSelected,
    });

  const floatingCell = useMemo(
    () => grid?.cells.find((cell) => cell._id === floatingCellId),
    [floatingCellId, grid?.cells],
  );
  const hasFloatingContent =
    floatingContent !== null && floatingContent !== undefined;
  const highlightedCell = useMemo(
    () => grid?.cells.find((cell) => cell._id === highlightCellId),
    [grid?.cells, highlightCellId],
  );
  const [floatingAnchor, setFloatingAnchor] = useState<FloatingAnchor | null>(
    null,
  );
  const [highlightBounds, setHighlightBounds] =
    useState<CellHighlightBounds | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !grid) {
      setFloatingAnchor(null);
      setHighlightBounds(null);
      return;
    }

    let frameId = 0;
    const updateOverlays = () => {
      const containerRect = container.getBoundingClientRect();
      const canvasElement =
        fabricCanvasRef.current?.upperCanvasEl ??
        fabricCanvasRef.current?.lowerCanvasEl;
      const canvasRect =
        canvasElement?.getBoundingClientRect() ?? containerRect;

      if (floatingCell && hasFloatingContent) {
        const x =
          canvasRect.left -
          containerRect.left +
          ((floatingCell.x + 0.5) / grid.grid.width) * canvasRect.width;
        const y =
          canvasRect.top -
          containerRect.top +
          ((floatingCell.y + 0.5) / grid.grid.height) * canvasRect.height;

        setFloatingAnchor((previous) => {
          const next = {
            x,
            y,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
          };
          if (
            previous &&
            Math.abs(previous.x - next.x) < 0.5 &&
            Math.abs(previous.y - next.y) < 0.5 &&
            Math.abs(previous.containerWidth - next.containerWidth) < 0.5 &&
            Math.abs(previous.containerHeight - next.containerHeight) < 0.5
          ) {
            return previous;
          }
          return next;
        });
      } else {
        setFloatingAnchor(null);
      }

      if (highlightedCell) {
        const cellWidth = canvasRect.width / grid.grid.width;
        const cellHeight = canvasRect.height / grid.grid.height;
        const next = {
          height: cellHeight,
          left:
            canvasRect.left -
            containerRect.left +
            highlightedCell.x * cellWidth,
          top:
            canvasRect.top - containerRect.top + highlightedCell.y * cellHeight,
          width: cellWidth,
        };
        setHighlightBounds((previous) => {
          if (
            previous &&
            Math.abs(previous.left - next.left) < 0.5 &&
            Math.abs(previous.top - next.top) < 0.5 &&
            Math.abs(previous.width - next.width) < 0.5 &&
            Math.abs(previous.height - next.height) < 0.5
          ) {
            return previous;
          }
          return next;
        });
      } else {
        setHighlightBounds(null);
      }
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateOverlays);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(container);
    const canvasElement =
      fabricCanvasRef.current?.upperCanvasEl ??
      fabricCanvasRef.current?.lowerCanvasEl;
    if (canvasElement) observer.observe(canvasElement);
    scheduleUpdate();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [
    fabricCanvasRef,
    floatingCell,
    grid,
    hasFloatingContent,
    highlightedCell,
  ]);

  const floatingStyle = useMemo<CSSProperties | undefined>(() => {
    if (!floatingAnchor) return undefined;
    const { x, y, containerWidth, containerHeight } = floatingAnchor;
    const compact = containerWidth < 640;
    if (compact) {
      return {
        bottom: 16,
        left: 16,
        maxHeight: Math.max(240, containerHeight - 32),
        width: Math.max(240, containerWidth - 32),
      };
    }

    const placeLeft = x > containerWidth / 2;
    const nearTop = y < containerHeight * 0.32;
    const nearBottom = y > containerHeight * 0.68;
    return {
      left: placeLeft ? x - 14 : x + 14,
      ...(nearTop ? { top: 16 } : nearBottom ? { bottom: 16 } : { top: y }),
      maxHeight: Math.max(240, containerHeight - 32),
      transform: `${placeLeft ? 'translateX(-100%)' : ''}${
        !nearTop && !nearBottom ? ' translateY(-50%)' : ''
      }`.trim(),
      width: Math.min(384, containerWidth - 32),
    };
  }, [floatingAnchor]);

  const defaultRevealedIds = useMemo(() => {
    const ids = new Set<string>();
    internalRevealed.forEach((id) => ids.add(id));
    revealedCellIds.forEach((id) => {
      if (id) ids.add(id);
    });
    return Array.from(ids);
  }, [internalRevealed, revealedCellIds]);

  const revealedCellIndices = useMemo(() => {
    if (!fogEnabled || !grid?.cells?.length || defaultRevealedIds.length === 0)
      return [];
    const width = grid.grid.width || 1;
    const revealedSet = new Set(defaultRevealedIds);
    return grid.cells
      .filter((cell) => revealedSet.has(cell._id))
      .map((cell) => cell.y * width + cell.x);
  }, [defaultRevealedIds, fogEnabled, grid]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-gray-100"
    >
      <div className="h-full w-full">
        <FabricGrid
          className="h-full w-full"
          onCellSelect={handleGridSelection}
          onReady={handleCanvasReady}
          onBackgroundError={(error) =>
            console.error('Map image error:', error)
          }
          fogEnabled={fogEnabled}
          revealedCellIndices={fogEnabled ? revealedCellIndices : undefined}
          cellVisuals={cellVisuals}
        />
      </div>
      {highlightBounds ? (
        <div
          aria-hidden="true"
          className="destination-spoiler-highlight pointer-events-none absolute z-10 border-[3px] border-amber-300 bg-amber-300/10"
          data-testid="destination-spoiler-highlight"
          style={highlightBounds}
        >
          <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center border-2 border-amber-950 bg-amber-300 font-mono text-base font-black leading-none text-amber-950 shadow-[3px_3px_0_rgba(69,26,3,0.9)]">
            !
          </span>
        </div>
      ) : null}
      {floatingContent && floatingStyle ? (
        <div
          className="pointer-events-auto absolute z-20 overflow-y-auto rounded-xl shadow-2xl ring-1 ring-black/10"
          style={floatingStyle}
          data-testid="map-floating-dialog"
        >
          {floatingContent}
        </div>
      ) : null}
    </div>
  );
}
