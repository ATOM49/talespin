import type {
  InteractionKind,
  MissionObjective,
  StoryStateChange,
} from '@talespin/schema';

export interface MutableStoryState {
  knownFacts: string[];
  consequences: string[];
  unresolvedThreads: string[];
  inventory: Array<{ key: string; name: string; description?: string }>;
  usedItemKeys: string[];
  relationships: Array<{
    characterRef: string;
    disposition: number;
    summary?: string;
  }>;
  visitedCellIds: string[];
  travelHistory: string[];
}

export function applyStoryStateChanges(
  current: MutableStoryState,
  changes: StoryStateChange[],
  constraints?: { allowedCharacterRefs?: string[] },
): MutableStoryState {
  const next: MutableStoryState = {
    knownFacts: [...current.knownFacts],
    consequences: [...current.consequences],
    unresolvedThreads: [...current.unresolvedThreads],
    inventory: current.inventory.map((item) => ({ ...item })),
    usedItemKeys: [...current.usedItemKeys],
    relationships: current.relationships.map((relationship) => ({
      ...relationship,
    })),
    visitedCellIds: [...current.visitedCellIds],
    travelHistory: [...current.travelHistory],
  };

  changes.forEach((change) => {
    switch (change.type) {
      case 'DISCOVER_FACT':
        if (!next.knownFacts.includes(change.key))
          next.knownFacts.push(change.key);
        break;
      case 'ADD_ITEM':
        if (!next.inventory.some((item) => item.key === change.key)) {
          next.inventory.push({
            key: change.key,
            name: change.name,
            ...(change.description ? { description: change.description } : {}),
          });
        }
        break;
      case 'USE_ITEM':
        if (
          next.inventory.some((item) => item.key === change.key) &&
          !next.usedItemKeys.includes(change.key)
        ) {
          next.usedItemKeys.push(change.key);
        }
        break;
      case 'UPDATE_RELATIONSHIP': {
        if (
          constraints?.allowedCharacterRefs &&
          !constraints.allowedCharacterRefs.includes(change.characterRef)
        )
          break;
        const existing = next.relationships.find(
          (relationship) => relationship.characterRef === change.characterRef,
        );
        if (existing) {
          existing.disposition = Math.max(
            -100,
            Math.min(100, existing.disposition + change.delta),
          );
          if (change.summary) existing.summary = change.summary;
        } else {
          next.relationships.push({
            characterRef: change.characterRef,
            disposition: Math.max(-100, Math.min(100, change.delta)),
            ...(change.summary ? { summary: change.summary } : {}),
          });
        }
        break;
      }
      case 'OPEN_THREAD':
        if (!next.unresolvedThreads.includes(change.key))
          next.unresolvedThreads.push(change.key);
        break;
      case 'CLOSE_THREAD':
        next.unresolvedThreads = next.unresolvedThreads.filter(
          (key) => key !== change.key,
        );
        break;
      case 'RECORD_CONSEQUENCE':
        if (!next.consequences.includes(change.summary))
          next.consequences.push(change.summary);
        break;
    }
  });
  return next;
}

export function evaluateObjectives(input: {
  objectives: MissionObjective[];
  currentCellId: string;
  resolvedInteractionKind?: InteractionKind;
  knownFacts: string[];
  inventoryItemKeys: string[];
  usedItemKeys?: string[];
  completedObjectiveIds?: string[];
}): MissionObjective[] {
  const completed = new Set(input.completedObjectiveIds ?? []);
  return input.objectives.map((objective) => {
    let complete = objective.complete || completed.has(objective.id);
    if (objective.type === 'REACH_CELL')
      complete ||= objective.cellId === input.currentCellId;
    if (objective.type === 'RESOLVE_INTERACTION') {
      complete ||= objective.interactionKind === input.resolvedInteractionKind;
    }
    if (objective.type === 'LEARN_FACT')
      complete ||= input.knownFacts.includes(objective.factKey);
    if (objective.type === 'ACQUIRE_ITEM') {
      complete ||= input.inventoryItemKeys.includes(objective.itemKey);
    }
    if (objective.type === 'USE_ITEM') {
      complete ||= (input.usedItemKeys ?? []).includes(objective.itemKey);
    }
    return { ...objective, complete };
  });
}

export function requiredObjectivesComplete(
  objectives: MissionObjective[],
): boolean {
  return objectives.every(
    (objective) => !objective.required || objective.complete,
  );
}
