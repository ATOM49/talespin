import type {
  GridCoordinate,
  MapBounds,
  RegionVisualSeed,
} from '@talespin/schema';

export type PartitionedRegion = {
  seed: RegionVisualSeed;
  cellCoordinates: GridCoordinate[];
  mapBounds: MapBounds;
};

const coordinateKey = ({ x, y }: GridCoordinate) => `${x}:${y}`;

export const partitionGridByAnchors = (
  seeds: RegionVisualSeed[],
  width = 8,
  height = 8,
): PartitionedRegion[] => {
  if (!seeds.length) {
    throw new Error('At least one region seed is required');
  }

  const anchors = new Set(seeds.map((seed) => coordinateKey(seed.anchor)));
  if (anchors.size !== seeds.length) {
    throw new Error('Region anchors must be unique');
  }

  const partitions = seeds.map((seed) => ({
    seed,
    cellCoordinates: [] as GridCoordinate[],
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      seeds.forEach((seed, index) => {
        const distance = (seed.anchor.x - x) ** 2 + (seed.anchor.y - y) ** 2;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      partitions[closestIndex]!.cellCoordinates.push({ x, y });
    }
  }

  return partitions.map(({ seed, cellCoordinates }) => {
    if (!cellCoordinates.length) {
      throw new Error(`Region ${seed.key} did not receive any grid cells`);
    }

    const xs = cellCoordinates.map((cell) => cell.x);
    const ys = cellCoordinates.map((cell) => cell.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      seed,
      cellCoordinates,
      mapBounds: {
        x: minX / width,
        y: minY / height,
        width: (maxX - minX + 1) / width,
        height: (maxY - minY + 1) / height,
      },
    };
  });
};

export const assertCompleteRegionCoverage = (
  regions: Array<{ key: string; cellCoordinates: GridCoordinate[] }>,
  width = 8,
  height = 8,
) => {
  const cells = new Set<string>();

  regions.forEach((region) => {
    region.cellCoordinates.forEach((cell) => {
      if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) {
        throw new Error(`Region ${region.key} references an out-of-range cell`);
      }
      const key = coordinateKey(cell);
      if (cells.has(key)) {
        throw new Error(`Grid cell ${key} belongs to multiple regions`);
      }
      cells.add(key);
    });
  });

  if (cells.size !== width * height) {
    throw new Error(
      `Region plan covers ${cells.size} of ${width * height} grid cells`,
    );
  }
};
