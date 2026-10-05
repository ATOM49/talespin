import type {
  GridCell,
  TransportOption,
  TravelLeg,
  TravelPlan,
  TravelStop,
  TraversalMedium,
  TraversalProfile,
} from '@talespin/schema';

const TERRAIN_RULES: Array<{
  pattern: RegExp;
  profile: TraversalProfile;
}> = [
  {
    pattern: /ocean|sea|river|lake|water|coast|reef|lagoon|canal|flood/i,
    profile: {
      medium: 'WATER',
      difficulty: 2,
      footAllowed: false,
      tags: ['water'],
    },
  },
  {
    pattern: /mountain|cliff|peak|ridge|crag|highland|ravine/i,
    profile: {
      medium: 'MOUNTAIN',
      difficulty: 3,
      footAllowed: false,
      tags: ['steep'],
    },
  },
  {
    pattern: /cave|cavern|underground|subterranean|tunnel|underworld/i,
    profile: {
      medium: 'SUBTERRANEAN',
      difficulty: 3,
      footAllowed: false,
      tags: ['underground'],
    },
  },
  {
    pattern: /sky|floating|aerial|cloud|void|chasm/i,
    profile: {
      medium: 'AERIAL',
      difficulty: 4,
      footAllowed: false,
      tags: ['air'],
    },
  },
  {
    pattern: /arcane|enchanted|dream|spirit|astral|mythic|magical/i,
    profile: {
      medium: 'ARCANE',
      difficulty: 4,
      footAllowed: false,
      tags: ['arcane'],
    },
  },
];

export function normalizeTraversal(
  cell: Pick<GridCell, 'walkable' | 'biome' | 'name' | 'tags' | 'traversal'>,
): TraversalProfile {
  if (cell.traversal) return cell.traversal;

  const source = [cell.biome, cell.name, ...cell.tags]
    .filter(Boolean)
    .join(' ');
  const matched = TERRAIN_RULES.find(({ pattern }) => pattern.test(source));
  if (matched) return { ...matched.profile, tags: [...matched.profile.tags] };

  return cell.walkable
    ? { medium: 'LAND', difficulty: 1, footAllowed: true, tags: [] }
    : {
        medium: 'LAND',
        difficulty: 2,
        footAllowed: false,
        tags: ['transport-required'],
      };
}

const coordinateKey = (x: number, y: number) => `${x}:${y}`;

export function findTerrainRoute(
  cells: GridCell[],
  startCellId: string,
  destinationCellId: string,
): string[] {
  const byId = new Map(cells.map((cell) => [cell._id, cell]));
  const start = byId.get(startCellId);
  const destination = byId.get(destinationCellId);
  if (!start || !destination)
    throw new Error('Travel cells must belong to the grid.');
  if (startCellId === destinationCellId) return [startCellId];

  const byCoordinate = new Map(
    cells.map((cell) => [coordinateKey(cell.x, cell.y), cell]),
  );
  const distance = new Map<string, number>([[startCellId, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set(cells.map((cell) => cell._id));

  while (pending.size > 0) {
    let currentId: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const candidate of pending) {
      const candidateDistance =
        distance.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        currentDistance = candidateDistance;
        currentId = candidate;
      }
    }
    if (!currentId || !Number.isFinite(currentDistance)) break;
    pending.delete(currentId);
    if (currentId === destinationCellId) break;

    const current = byId.get(currentId)!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const neighbor = byCoordinate.get(
        coordinateKey(current.x + dx, current.y + dy),
      );
      if (!neighbor || !pending.has(neighbor._id)) continue;
      const candidateDistance =
        currentDistance + normalizeTraversal(neighbor).difficulty;
      if (
        candidateDistance <
        (distance.get(neighbor._id) ?? Number.POSITIVE_INFINITY)
      ) {
        distance.set(neighbor._id, candidateDistance);
        previous.set(neighbor._id, currentId);
      }
    }
  }

  if (!distance.has(destinationCellId))
    throw new Error('No route exists between the selected cells.');
  const path = [destinationCellId];
  while (path[0] !== startCellId) {
    const prior = previous.get(path[0]);
    if (!prior) throw new Error('The calculated route is incomplete.');
    path.unshift(prior);
  }
  return path;
}

export function fallbackTransportOptions(
  medium: TraversalMedium,
): TransportOption[] {
  const options: Record<TraversalMedium, Array<[string, string, number]>> = {
    LAND: [
      ['land-caravan', 'Join a local caravan', 1],
      ['all-terrain-mount', 'Ride an all-terrain mount', 1],
    ],
    WATER: [
      ['sturdy-boat', 'Take a sturdy boat', 2],
      ['water-creature', 'Call a mythical water creature', 1],
    ],
    MOUNTAIN: [
      ['sure-footed-mount', 'Ride a sure-footed mount', 2],
      ['winged-guide', 'Follow a winged mountain guide', 1],
    ],
    SUBTERRANEAN: [
      ['cavern-guide', 'Hire a cavern guide', 2],
      ['burrowing-creature', 'Ride a burrowing creature', 1],
    ],
    AERIAL: [
      ['flying-mount', 'Ride a flying mount', 2],
      ['sky-vessel', 'Board a sky vessel', 1],
    ],
    ARCANE: [
      ['arcane-passage', 'Open an arcane passage', 2],
      ['spirit-guide', 'Trust a spirit guide', 1],
    ],
  };

  return options[medium].map(([id, name, actionCost]) => ({
    id,
    name,
    description: `${name} across the ${medium.toLowerCase()} leg of the journey.`,
    supportedMedia: [medium],
    actionCost,
  }));
}

function buildLegs(pathCells: GridCell[]): TravelLeg[] {
  const legs: TravelLeg[] = [];
  pathCells.forEach((cell, index) => {
    const profile = normalizeTraversal(cell);
    const previous = legs.at(-1);
    if (previous && previous.medium === profile.medium) {
      previous.endIndex = index;
      previous.actionCost += profile.difficulty;
      return;
    }
    legs.push({
      startIndex: index,
      endIndex: index,
      medium: profile.medium,
      actionCost: index === 0 ? 0 : profile.difficulty,
      transport:
        profile.medium === 'LAND' && profile.footAllowed
          ? {
              id: 'on-foot',
              name: 'Travel on foot',
              description: 'Continue across terrain suitable for walking.',
              supportedMedia: ['LAND'],
              actionCost: 1,
            }
          : undefined,
    });
  });
  return legs;
}

export function buildTravelPlan(input: {
  cells: GridCell[];
  startCellId: string;
  destinationCellId: string;
  waypointCellIds?: string[];
  encounterCellIds?: string[];
}): TravelPlan {
  const targets = [
    ...(input.waypointCellIds ?? []),
    input.destinationCellId,
  ].filter((cellId, index, values) => values.indexOf(cellId) === index);
  const pathCellIds = targets.reduce<string[]>((path, targetCellId) => {
    const startCellId = path.at(-1) ?? input.startCellId;
    const segment = findTerrainRoute(input.cells, startCellId, targetCellId);
    return path.length === 0 ? segment : [...path, ...segment.slice(1)];
  }, []);
  const cellsById = new Map(input.cells.map((cell) => [cell._id, cell]));
  const pathCells = pathCellIds.map((id) => cellsById.get(id)!);
  const legs = buildLegs(pathCells);
  const stops: TravelStop[] = [];
  const waypointIds = new Set(input.waypointCellIds ?? []);
  const encounterIds = new Set(input.encounterCellIds ?? []);

  legs.forEach((leg) => {
    if (!leg.transport) {
      stops.push({
        cellId: pathCellIds[leg.startIndex],
        routeIndex: leg.startIndex,
        kind: 'TRANSPORT',
      });
    }
  });
  pathCellIds.forEach((cellId, routeIndex) => {
    if (waypointIds.has(cellId))
      stops.push({ cellId, routeIndex, kind: 'WAYPOINT' });
    if (encounterIds.has(cellId))
      stops.push({ cellId, routeIndex, kind: 'ENCOUNTER' });
  });
  stops.push({
    cellId: input.destinationCellId,
    routeIndex: pathCellIds.length - 1,
    kind: 'DESTINATION',
  });

  return {
    destinationCellId: input.destinationCellId,
    pathCellIds,
    currentIndex: 0,
    legs,
    stops: stops.sort((a, b) => a.routeIndex - b.routeIndex),
    estimatedActionCost: legs.reduce((total, leg) => total + leg.actionCost, 0),
  };
}

export function chooseTransport(
  plan: TravelPlan,
  option: TransportOption,
): TravelPlan {
  const currentLeg = plan.legs.find(
    (candidate) =>
      candidate.startIndex <= plan.currentIndex &&
      candidate.endIndex >= plan.currentIndex,
  );
  const leg =
    currentLeg && !currentLeg.transport
      ? currentLeg
      : plan.legs.find(
          (candidate) =>
            candidate.startIndex === plan.currentIndex + 1 &&
            !candidate.transport,
        );
  if (!leg) throw new Error('No active travel leg exists.');
  if (!option.supportedMedia.includes(leg.medium)) {
    throw new Error('That transport cannot cross the current terrain.');
  }
  return {
    ...plan,
    legs: plan.legs.map((candidate) =>
      candidate === leg ? { ...candidate, transport: option } : candidate,
    ),
  };
}

export function advanceTravel(plan: TravelPlan): {
  plan: TravelPlan;
  traversedCellIds: string[];
  actionCost: number;
  stop?: TravelStop;
} {
  const currentLeg = plan.legs.find(
    (leg) =>
      leg.startIndex <= plan.currentIndex && leg.endIndex >= plan.currentIndex,
  );
  if (!currentLeg?.transport)
    throw new Error('Choose transport before continuing.');

  const nextLeg = plan.legs.find(
    (leg) => leg.startIndex === plan.currentIndex + 1,
  );
  const activeLeg =
    currentLeg.endIndex === plan.currentIndex && nextLeg?.transport
      ? nextLeg
      : currentLeg;
  if (!activeLeg.transport)
    throw new Error('Choose transport before continuing.');

  const nextStop = plan.stops.find((stop) => {
    if (stop.routeIndex <= plan.currentIndex) return false;
    if (stop.kind !== 'TRANSPORT') return true;
    const stoppedLeg = plan.legs.find(
      (leg) => leg.startIndex === stop.routeIndex,
    );
    return !stoppedLeg?.transport;
  });
  if (nextStop?.kind === 'TRANSPORT') {
    const endIndex = nextStop.routeIndex - 1;
    const traversedCellIds = plan.pathCellIds.slice(
      plan.currentIndex + 1,
      endIndex + 1,
    );
    return {
      plan: { ...plan, currentIndex: endIndex },
      traversedCellIds,
      actionCost: traversedCellIds.length * currentLeg.transport.actionCost,
      stop: nextStop,
    };
  }
  const endIndex = Math.min(
    activeLeg.endIndex,
    nextStop?.routeIndex ?? plan.pathCellIds.length - 1,
  );

  const traversedCellIds = plan.pathCellIds.slice(
    plan.currentIndex + 1,
    endIndex + 1,
  );
  const actionCost = traversedCellIds.length * activeLeg.transport.actionCost;
  return {
    plan: { ...plan, currentIndex: endIndex },
    traversedCellIds,
    actionCost,
    stop: plan.stops.find(
      (stop) =>
        stop.routeIndex === endIndex &&
        (stop.kind !== 'TRANSPORT' || !activeLeg.transport),
    ),
  };
}
