'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Layers3 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import type {
  Faction,
  GridCell,
  Region,
  World,
  WorldGrid,
} from '@talespin/schema';

import type { GridCellVisual } from '@/components/FabricGrid/types';
import GridCellFormComponent from '@/components/form/grid-cell';
import { MapEditorWithToolbar } from '@/components/map-editor-with-toolbar';
import { MapRegionDetails } from '@/components/map-region-details';
import { MapViewer } from '@/components/map-viewer';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cn } from '@/lib/utils';

type WorldGridResponse = {
  grid: WorldGrid;
  cells: GridCell[];
};

type RegionPalette = GridCellVisual & {
  accent: string;
};

const EMPTY_FACTIONS: Faction[] = [];
const EMPTY_REGIONS: Region[] = [];
const EMPTY_CELL_IDS: string[] = [];

const REGION_PALETTE: RegionPalette[] = [
  {
    accent: '#f59e0b',
    fill: 'rgba(245,158,11,0.16)',
    hoverFill: 'rgba(245,158,11,0.3)',
    selectedFill: 'rgba(245,158,11,0.44)',
  },
  {
    accent: '#0ea5e9',
    fill: 'rgba(14,165,233,0.16)',
    hoverFill: 'rgba(14,165,233,0.3)',
    selectedFill: 'rgba(14,165,233,0.44)',
  },
  {
    accent: '#10b981',
    fill: 'rgba(16,185,129,0.16)',
    hoverFill: 'rgba(16,185,129,0.3)',
    selectedFill: 'rgba(16,185,129,0.44)',
  },
  {
    accent: '#8b5cf6',
    fill: 'rgba(139,92,246,0.16)',
    hoverFill: 'rgba(139,92,246,0.3)',
    selectedFill: 'rgba(139,92,246,0.44)',
  },
  {
    accent: '#f43f5e',
    fill: 'rgba(244,63,94,0.16)',
    hoverFill: 'rgba(244,63,94,0.3)',
    selectedFill: 'rgba(244,63,94,0.44)',
  },
  {
    accent: '#06b6d4',
    fill: 'rgba(6,182,212,0.16)',
    hoverFill: 'rgba(6,182,212,0.3)',
    selectedFill: 'rgba(6,182,212,0.44)',
  },
];

export default function MapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { data: session, status } = useSession();
  const isSessionLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';
  const canEdit = session?.user?.role === 'BUILDER';

  const worldQuery = useApiQuery<World>(`/api/worlds/${id}`, undefined, {
    enabled: isAuthenticated,
  });
  const gridQuery = useApiQuery<WorldGridResponse>(
    `/api/worlds/${id}/grid`,
    undefined,
    { enabled: isAuthenticated },
  );
  const regionsQuery = useApiQuery<Region[]>(
    `/api/worlds/${id}/regions`,
    undefined,
    { enabled: isAuthenticated },
  );
  const factionsQuery = useApiQuery<Faction[]>(
    `/api/worlds/${id}/factions`,
    undefined,
    { enabled: isAuthenticated },
  );

  const world = worldQuery.data;
  const worldGrid = gridQuery.data;
  const regions = regionsQuery.data ?? EMPTY_REGIONS;
  const factions = factionsQuery.data ?? EMPTY_FACTIONS;

  const [showMovementGrid, setShowMovementGrid] = useState(false);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);

  const effectiveShowMovementGrid = showMovementGrid || regions.length === 0;
  const activeRegion = useMemo(
    () => regions.find((region) => region._id === activeRegionId) ?? null,
    [activeRegionId, regions],
  );
  const selectedRegionCellIds = activeRegion?.cellIds ?? EMPTY_CELL_IDS;

  const factionById = useMemo(
    () => new Map(factions.map((faction) => [faction._id, faction])),
    [factions],
  );
  const regionByCellId = useMemo(() => {
    const result = new Map<string, Region>();
    regions.forEach((region) => {
      region.cellIds.forEach((cellId) => result.set(cellId, region));
    });
    return result;
  }, [regions]);
  const paletteByRegionId = useMemo(
    () =>
      new Map(
        regions.map((region, index) => [
          region._id,
          REGION_PALETTE[index % REGION_PALETTE.length],
        ]),
      ),
    [regions],
  );
  const cellVisuals = useMemo<Record<number, GridCellVisual>>(() => {
    if (!worldGrid) return {};

    return worldGrid.cells.reduce<Record<number, GridCellVisual>>(
      (visuals, cell) => {
        const region = regionByCellId.get(cell._id);
        const palette = region ? paletteByRegionId.get(region._id) : undefined;
        if (palette) {
          visuals[cell.y * worldGrid.grid.width + cell.x] = palette;
        }
        return visuals;
      },
      {},
    );
  }, [paletteByRegionId, regionByCellId, worldGrid]);

  const handleCellSelected = useCallback(
    (cell: GridCell | null) => {
      if (!effectiveShowMovementGrid) return;
      setActiveCellId(cell?._id ?? null);
    },
    [effectiveShowMovementGrid],
  );

  const handleCellClick = useCallback(
    (cell: GridCell) => {
      if (effectiveShowMovementGrid) {
        setActiveRegionId(null);
        setActiveCellId(cell._id);
        return;
      }

      const region = regionByCellId.get(cell._id);
      setActiveCellId(null);
      setActiveRegionId(region?._id ?? null);
    },
    [effectiveShowMovementGrid, regionByCellId],
  );

  const handleRegionSelect = useCallback((regionId: string) => {
    setShowMovementGrid(false);
    setActiveCellId(null);
    setActiveRegionId(regionId);
  }, []);

  const handleMovementGridChange = useCallback((checked: boolean) => {
    setShowMovementGrid(checked);
    setActiveCellId(null);
    setActiveRegionId(null);
  }, []);

  const renderCellDetails = useCallback(
    (cell: GridCell, onClose: () => void) => (
      <SidebarGroup>
        <SidebarGroupLabel>Movement cell</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="mb-4 space-y-3 rounded-md border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coordinates</span>
              <span className="font-medium">
                ({cell.x}, {cell.y})
              </span>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              Clear selection
            </button>
          </div>
          {canEdit ? (
            <GridCellFormComponent cell={cell} onSuccess={() => undefined} />
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
    ),
    [canEdit],
  );

  if (
    isSessionLoading ||
    (isAuthenticated &&
      (worldQuery.isLoading ||
        gridQuery.isLoading ||
        regionsQuery.isLoading ||
        factionsQuery.isLoading))
  ) {
    return <Spinner />;
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      <div className="absolute left-4 top-4 z-20 w-[min(22rem,calc(100%-2rem))] rounded-xl border bg-background/92 p-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers3 className="size-4 text-primary" aria-hidden />
          Map layers
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {regions.length > 0
            ? 'Select a colored territory to explore its people and story.'
            : 'No generated regions are available, so the movement grid is shown.'}
        </p>
        <label className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs font-medium">
          <span>Movement grid</span>
          <Switch
            checked={effectiveShowMovementGrid}
            disabled={regions.length === 0}
            onCheckedChange={handleMovementGridChange}
            aria-label="Show movement grid"
          />
        </label>

        {regions.length > 0 ? (
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto border-t pt-3">
            {regions.map((region) => {
              const palette = paletteByRegionId.get(region._id);
              const isActive = activeRegionId === region._id;

              return (
                <button
                  key={region._id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                    isActive && 'bg-accent font-medium',
                  )}
                  aria-pressed={isActive}
                  onClick={() => handleRegionSelect(region._id)}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-2 ring-background"
                    style={{ backgroundColor: palette?.accent }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{region.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {region.cellIds.length}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {canEdit ? (
          <MapEditorWithToolbar
            imageUrl={world?.mapImageUrl || ''}
            grid={worldGrid}
            activeCellId={effectiveShowMovementGrid ? activeCellId : undefined}
            selectedCellIds={
              effectiveShowMovementGrid ? undefined : selectedRegionCellIds
            }
            showGrid={effectiveShowMovementGrid}
            cellVisuals={cellVisuals}
            onCellSelected={handleCellSelected}
            onCellClick={handleCellClick}
            renderCellDetails={renderCellDetails}
          />
        ) : (
          <MapViewer
            imageUrl={world?.mapImageUrl || ''}
            grid={worldGrid}
            activeCellId={effectiveShowMovementGrid ? activeCellId : undefined}
            selectedCellIds={
              effectiveShowMovementGrid ? undefined : selectedRegionCellIds
            }
            onCellSelected={handleCellSelected}
            onCellClick={handleCellClick}
            showGrid={effectiveShowMovementGrid}
            cellVisuals={cellVisuals}
            fogEnabled={!canEdit && effectiveShowMovementGrid}
            homeCellId={worldGrid?.grid.homeCellId}
          />
        )}
      </div>

      <Drawer
        open={Boolean(activeRegion)}
        onOpenChange={(open) => {
          if (!open) setActiveRegionId(null);
        }}
        direction="right"
      >
        <DrawerContent className="w-full max-w-lg border-l border-sidebar-border sm:max-w-lg">
          {activeRegion ? (
            <>
              <DrawerHeader className="border-b p-5">
                <DrawerTitle className="text-2xl">
                  {activeRegion.name}
                </DrawerTitle>
                <DrawerDescription className="leading-relaxed">
                  {activeRegion.summary}
                </DrawerDescription>
              </DrawerHeader>
              <MapRegionDetails
                region={activeRegion}
                factionById={factionById}
              />
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
