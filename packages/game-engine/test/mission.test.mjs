import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  createChapterObjectives,
  evaluateMissionProgress,
  resolveInteractionOutcome,
} from '../dist/index.js';

const state = {
  knownFacts: [],
  consequences: [],
  unresolvedThreads: [],
  inventory: [],
  usedItemKeys: [],
  relationships: [],
  visitedCellIds: [],
  travelHistory: [],
};
const objective = {
  id: 'fact',
  type: 'LEARN_FACT',
  label: 'Learn',
  required: true,
  complete: false,
  factKey: 'truth',
};
const base = {
  state,
  objectives: [objective],
  currentCellId: 'end',
  destinationCellId: 'end',
  actionsUsed: 1,
  maxActions: 10,
};

it('does not grant objective completion from model-provided IDs', () => {
  const transition = resolveInteractionOutcome({
    ...base,
    target: { type: 'CELL', cellId: 'end' },
    kind: 'DIALOGUE',
    chapterTitle: 'Chapter',
    proposed: {
      accepted: true,
      narrative: 'Finished!',
      stateChanges: [],
      completedObjectiveIds: ['fact'],
    },
  });
  assert.equal(transition.complete, false);
  assert.deepEqual(transition.outcome.completedObjectiveIds, []);
});

it('rejects unauthorized relationships and leaves the input state unchanged', () => {
  const transition = resolveInteractionOutcome({
    ...base,
    target: { type: 'WORLD_CHARACTER', characterId: 'friend' },
    kind: 'DIALOGUE',
    chapterTitle: 'Chapter',
    proposed: {
      accepted: true,
      narrative: 'Talk',
      completedObjectiveIds: [],
      stateChanges: [
        { type: 'UPDATE_RELATIONSHIP', characterRef: 'stranger', delta: 10 },
        { type: 'UPDATE_RELATIONSHIP', characterRef: 'friend', delta: 10 },
      ],
    },
  });
  assert.deepEqual(transition.state.relationships, [
    { characterRef: 'friend', disposition: 10 },
  ]);
  assert.deepEqual(state.relationships, []);
});

it('does not apply changes or discoveries from a rejected outcome', () => {
  const transition = resolveInteractionOutcome({
    ...base,
    target: { type: 'CELL', cellId: 'end' },
    kind: 'DISCOVERY',
    chapterTitle: 'Chapter',
    proposed: {
      accepted: false,
      narrative: 'Rejected',
      stateChanges: [
        { type: 'DISCOVER_FACT', key: 'truth', summary: 'Claimed' },
      ],
      completedObjectiveIds: ['fact'],
    },
  });
  assert.deepEqual(transition.state.knownFacts, []);
  assert.equal(transition.complete, false);
});

it('completion takes precedence over exhausting the budget on the final action', () => {
  const transition = evaluateMissionProgress({
    ...base,
    state: { ...state, knownFacts: ['truth'] },
    actionsUsed: 10,
  });
  assert.equal(transition.status, 'SUCCESS');
  assert.equal(transition.failed, false);
});

it('creates the final chapter confrontation and deterministic waypoint', () => {
  const result = createChapterObjectives({
    chapterId: 'chapter',
    chapterOrder: 3,
    destinationCellId: 'end',
    route: ['start', 'middle', 'end'],
  });
  assert.equal(result.waypointCellId, 'middle');
  assert.ok(
    result.objectives.some(
      (item) =>
        item.type === 'RESOLVE_INTERACTION' &&
        item.interactionKind === 'FINALE',
    ),
  );
});
