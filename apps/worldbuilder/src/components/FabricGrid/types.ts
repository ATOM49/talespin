'use client';

import type { CSSProperties } from 'react';
import type { Canvas, Rect } from 'fabric';
import type {
  GridConfig,
  GridCellMetadata as BaseGridCellMetadata,
  RegionSelection,
} from '@talespin/schema';

// Export schema types
export type { GridConfig, RegionSelection };

// Extend GridCellMetadata with Fabric-specific rect + fog metadata
export interface GridCellMetadata extends BaseGridCellMetadata {
  rect?: Rect;
  fogRect?: Rect;
  isRevealed?: boolean;
  wasManuallyRevealed?: boolean;
}

export type OnCellClick = (cells: GridCellMetadata[]) => void;

export interface GridCellVisual {
  fill: string;
  hoverFill: string;
  selectedFill?: string;
}

export interface FabricGridProps {
  className?: string;
  style?: CSSProperties;
  onCellSelect?: OnCellClick;
  onReady?: (canvas: Canvas | null) => void;
  onBackgroundError?: (error: Error) => void;
  fogEnabled?: boolean;
  revealedCellIndices?: number[];
  cellVisuals?: Record<number, GridCellVisual>;
}

export interface UseFabricGridOptions {
  onCellSelect?: OnCellClick;
  onBackgroundError?: (error: Error) => void;
  fogEnabled?: boolean;
  revealedCellIndices?: number[];
  cellVisuals?: Record<number, GridCellVisual>;
}
