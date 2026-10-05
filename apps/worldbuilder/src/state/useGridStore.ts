'use client';

import { create, type StateCreator } from 'zustand';
import type {
  GridCellMetadata,
  GridConfig,
  RegionSelection,
} from '@talespin/schema';
import { buildGridDocument } from '@/utils/mongoSchemas';

export interface GridState {
  config: GridConfig;
  worldImageUrl?: string;
  imageDimensions?: { width: number; height: number };
  selectedCells: GridCellMetadata[];
  region?: RegionSelection;
  interactionMode: 'grid' | 'location';
  setConfig: (cfg: Partial<GridConfig>) => void;
  setWorldImage: (url?: string) => void;
  setImageDimensions: (dimensions?: { width: number; height: number }) => void;
  setInteractionMode: (mode: 'grid' | 'location') => void;
  toggleCell: (cell: GridCellMetadata) => void;
  setSelectedCells: (cells: GridCellMetadata[]) => void;
  clearSelection: () => void;
  setRegion: (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => void;
  serializeForMongo: () => ReturnType<typeof buildGridDocument>;
}

const normalizeCell = (cell: GridCellMetadata): GridCellMetadata => ({
  ...cell,
  selected: true,
});

const storeCreator: StateCreator<GridState, [], []> = (set, get) => ({
  config: {
    width: 800,
    height: 600,
    cellsX: 10,
    cellsY: 10,
    showGrid: true,
  },
  selectedCells: [],
  region: undefined,
  worldImageUrl: undefined,
  imageDimensions: undefined,
  interactionMode: 'grid',

  setConfig: (cfg: Partial<GridConfig>) =>
    set((state: GridState) => ({ config: { ...state.config, ...cfg } })),

  setWorldImage: (url?: string) => set({ worldImageUrl: url }),

  setImageDimensions: (dimensions?: { width: number; height: number }) =>
    set({ imageDimensions: dimensions }),

  setInteractionMode: (mode: 'grid' | 'location') =>
    set({ interactionMode: mode }),

  toggleCell: (cell: GridCellMetadata) =>
    set((state: GridState) => {
      const exists = state.selectedCells.find(
        (selected: GridCellMetadata) => selected.index === cell.index,
      );
      const updated = exists
        ? state.selectedCells.filter(
            (selected: GridCellMetadata) => selected.index !== cell.index,
          )
        : [...state.selectedCells, normalizeCell(cell)];
      return { selectedCells: updated };
    }),

  setSelectedCells: (cells: GridCellMetadata[]) => {
    const deduped = cells.reduce<GridCellMetadata[]>((acc, cell) => {
      if (acc.find((existing) => existing.index === cell.index)) {
        return acc;
      }
      acc.push(normalizeCell(cell));
      return acc;
    }, []);
    set({ selectedCells: deduped });
  },

  clearSelection: () => set({ selectedCells: [] }),

  setRegion: (start: { x: number; y: number }, end: { x: number; y: number }) =>
    set({ region: { startCell: start, endCell: end } }),

  serializeForMongo: () => {
    const { selectedCells, config, worldImageUrl, imageDimensions } = get();
    return buildGridDocument({
      width: config.width,
      height: config.height,
      cellsX: config.cellsX,
      cellsY: config.cellsY,
      showGrid: config.showGrid,
      worldImageUrl,
      selectedCells: selectedCells.map((cell: GridCellMetadata) => ({
        cellX: cell.cellX,
        cellY: cell.cellY,
        index: cell.index,
        x: cell.cellX,
        y: cell.cellY,
      })),
    });
  },
});

export const useGridStore = create<GridState>(storeCreator);
