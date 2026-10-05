import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegionVisualSeed } from '@talespin/schema';
import {
  assertCompleteRegionCoverage,
  partitionGridByAnchors,
} from '../../src/utils/world-regions.js';

const seeds: RegionVisualSeed[] = [
  {
    key: 'north-west',
    name: 'North West',
    anchor: { x: 1, y: 1 },
    visualSummary: 'High country',
  },
  {
    key: 'north-east',
    name: 'North East',
    anchor: { x: 6, y: 1 },
    visualSummary: 'Open coast',
  },
  {
    key: 'south-west',
    name: 'South West',
    anchor: { x: 1, y: 6 },
    visualSummary: 'Deep forest',
  },
  {
    key: 'south-east',
    name: 'South East',
    anchor: { x: 6, y: 6 },
    visualSummary: 'River delta',
  },
];

test('partitions every cell exactly once and preserves seed order', () => {
  const regions = partitionGridByAnchors(seeds);

  assert.deepEqual(
    regions.map((region) => region.seed.key),
    seeds.map((seed) => seed.key),
  );
  assert.equal(
    regions.reduce((total, region) => total + region.cellCoordinates.length, 0),
    64,
  );
  assert.doesNotThrow(() =>
    assertCompleteRegionCoverage(
      regions.map((region) => ({
        key: region.seed.key,
        cellCoordinates: region.cellCoordinates,
      })),
    ),
  );
  regions.forEach((region) => {
    assert.ok(region.cellCoordinates.length > 0);
    assert.ok(region.mapBounds.width > 0);
    assert.ok(region.mapBounds.height > 0);
  });
});

test('rejects duplicate anchors before partitioning', () => {
  assert.throws(
    () => partitionGridByAnchors([...seeds, { ...seeds[0]!, key: 'copy' }]),
    /anchors must be unique/,
  );
});

test('rejects duplicate or incomplete persisted coverage', () => {
  assert.throws(
    () =>
      assertCompleteRegionCoverage([
        { key: 'a', cellCoordinates: [{ x: 0, y: 0 }] },
        { key: 'b', cellCoordinates: [{ x: 0, y: 0 }] },
      ]),
    /belongs to multiple regions/,
  );
});
