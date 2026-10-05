import {
  MissionObjectiveSchema,
  type GridCell,
  type MissionObjective,
  type InteractionKind,
  type InteractionOutcome,
  type InteractionTarget,
} from '@talespin/models';
import { findTerrainRoute } from './travel.js';
import {
  applyStoryStateChanges,
  evaluateObjectives,
  requiredObjectivesComplete,
  type MutableStoryState,
} from './story-state.js';

export function selectMissionDestination(
  cells: GridCell[],
  startCellId: string,
  hint: string,
  excluded: Set<string>,
): GridCell {
  const terms = hint
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 3);
  const candidates = cells.filter(
    (cell) => cell._id !== startCellId && !excluded.has(cell._id),
  );
  const matching = candidates.filter((cell) => {
    const source = [cell.name, cell.biome, ...cell.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return terms.some((term) => source.includes(term));
  });
  const rankReachable = (pool: GridCell[]) =>
    pool.flatMap((cell) => {
      try {
        return [
          {
            cell,
            route: findTerrainRoute(cells, startCellId, cell._id),
          },
        ];
      } catch {
        return [];
      }
    });
  const byDistance = (left: { route: string[] }, right: { route: string[] }) =>
    right.route.length - left.route.length;
  const narrativeMatches = rankReachable(matching).sort(byDistance);
  const fallback = rankReachable(candidates).sort(byDistance);
  const destination = (narrativeMatches[0] ?? fallback[0])?.cell;
  if (!destination) throw new Error('No destination cell is available.');
  return destination;
}

export function createChapterObjectives(input: {
  chapterId: string;
  chapterOrder: number;
  destinationCellId: string;
  destinationName?: string;
  route: string[];
}) {
  const waypointCellId =
    input.route[Math.max(1, Math.floor(input.route.length / 2))] ??
    input.destinationCellId;
  const factKey = `chapter-${input.chapterOrder}-discovery`;
  const objectives: MissionObjective[] = [
    {
      id: `reach-${input.destinationCellId}`,
      type: 'REACH_CELL',
      label: `Reach ${input.destinationName ?? 'the mission destination'}`,
      required: true,
      complete: false,
      cellId: input.destinationCellId,
    },
    {
      id: `encounter-${input.chapterId}`,
      type: 'RESOLVE_INTERACTION',
      label: 'Speak with a character who can set the chapter in motion',
      required: true,
      complete: false,
      interactionKind: 'DIALOGUE',
    },
    {
      id: `fact-${input.chapterId}`,
      type: 'LEARN_FACT',
      label: 'Uncover the truth hidden in this chapter',
      required: true,
      complete: false,
      factKey,
    },
    ...(input.chapterOrder === 3
      ? [
          {
            id: `finale-${input.chapterId}`,
            type: 'RESOLVE_INTERACTION' as const,
            label: 'Resolve the final confrontation',
            required: true,
            complete: false,
            interactionKind: 'FINALE' as const,
          },
        ]
      : []),
  ].map((objective) => MissionObjectiveSchema.parse(objective));

  return { objectives, waypointCellId };
}

export function evaluateMissionProgress(input: {
  objectives: MissionObjective[];
  state: MutableStoryState;
  currentCellId: string;
  destinationCellId: string;
  actionsUsed: number;
  maxActions: number;
  resolvedInteractionKind?: InteractionKind;
}) {
  const objectives = evaluateObjectives({
    objectives: input.objectives,
    currentCellId: input.currentCellId,
    resolvedInteractionKind: input.resolvedInteractionKind,
    knownFacts: input.state.knownFacts,
    inventoryItemKeys: input.state.inventory.map((item) => item.key),
    usedItemKeys: input.state.usedItemKeys,
  });
  const complete =
    input.currentCellId === input.destinationCellId &&
    requiredObjectivesComplete(objectives);
  const failed = !complete && input.actionsUsed >= input.maxActions;
  return {
    objectives,
    complete,
    failed,
    status: complete
      ? ('SUCCESS' as const)
      : failed
        ? ('FAILED' as const)
        : ('ACTIVE' as const),
  };
}

export function resolveInteractionOutcome(input: {
  proposed: InteractionOutcome;
  target: InteractionTarget;
  kind: InteractionKind;
  chapterTitle: string;
  state: MutableStoryState;
  objectives: MissionObjective[];
  currentCellId: string;
  destinationCellId: string;
  actionsUsed: number;
  maxActions: number;
}) {
  const allowedCharacterRefs =
    input.target.type === 'WORLD_CHARACTER'
      ? [input.target.characterId]
      : input.target.type === 'STORY_CHARACTER'
        ? [input.target.storyCharacterId]
        : [];
  const changes = input.proposed.accepted
    ? input.proposed.stateChanges.filter(
        (change) =>
          change.type !== 'UPDATE_RELATIONSHIP' ||
          allowedCharacterRefs.includes(change.characterRef),
      )
    : [];
  if (input.proposed.accepted && input.kind === 'DISCOVERY') {
    for (const objective of input.objectives) {
      if (
        objective.type === 'LEARN_FACT' &&
        !objective.complete &&
        !changes.some(
          (change) =>
            change.type === 'DISCOVER_FACT' && change.key === objective.factKey,
        )
      ) {
        changes.push({
          type: 'DISCOVER_FACT',
          key: objective.factKey,
          summary: `A truth uncovered during ${input.chapterTitle}.`,
        });
      }
    }
  }
  // Model-supplied objective IDs never grant mechanical progress.
  const outcome: InteractionOutcome = {
    ...input.proposed,
    stateChanges: changes,
    completedObjectiveIds: [],
  };
  const state = applyStoryStateChanges(input.state, changes, {
    allowedCharacterRefs,
  });
  return {
    outcome,
    state,
    ...evaluateMissionProgress({
      ...input,
      state,
      resolvedInteractionKind: input.proposed.accepted ? input.kind : undefined,
    }),
  };
}
