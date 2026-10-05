# Domain Model

## Current Model

`packages/schema` is the runtime contract source of truth, with MongoDB representations in `apps/worldbuilder/prisma/schema.prisma`.

```text
World
├── WorldGrid -> GridCell
├── Region -> GridCell references + faction presence
├── Location
├── Faction / Culture / Species / Archetype
├── Character
├── Story -> StoryParticipant -> Character reference
│   ├── Chapter -> Mission attempt -> Interaction / MissionAction
│   ├── StoryCharacter
│   └── NarrativeJob
├── Relationship
├── TreasureHuntConfig
├── TreasureHuntRun -> TreasureHuntEvent
└── PlayerWorldExploration
```

`World` is the aggregate around a reusable setting. Its optional generated lore keeps downstream content coherent. Regions are semantic map territories with explicit grid-cell references, crop bounds, mission hooks, and typed faction-presence metadata. Locations remain flat points with relative coordinates and optional grid-cell references; they are not hierarchical. Characters and factions have stable IDs and structured metadata. `Story` persists explorer-specific narrative state, while `StoryParticipant` associates its authenticated User and selected Character without changing character ownership. Three ordered Chapters contain versioned Mission attempts and durable Interactions. `Campaign` remains a separate early route/goal contract.

## Narrative Model

```text
Story
├── Plot
├── World reference
├── Character references
├── Chapters
└── StoryState

Chapter
├── ChapterState
└── Missions

Mission
├── Objectives
├── MissionState
└── Interactions

Interaction
├── Context
├── AvailableActions
├── PlayerAction
├── Outcome
└── StateChanges
```

The Story owns the plot; chapters and missions advance it. A Story references an existing World rather than duplicating the setting. Persistent entities use stable IDs.

## Mapping Rules

| Target concept | Current analogue                  | Guidance                                                               |
| -------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Story          | `Story`, `StoryParticipant`       | Owns plot, setup status, durable state, and completion.                |
| Chapter        | `Chapter`                         | Three ordered progression phases with Story checkpoints.               |
| Mission        | `Mission`                         | Versioned attempts with route, objectives, budget, and terminal rules. |
| Interaction    | `Interaction`, `MissionAction`    | Ordered situations plus idempotent player action records.              |
| World          | `World`, grid, regions, locations | Preserve as the reusable setting model.                                |
| State change   | `StoryStateChange`                | Validated proposals applied by deterministic engine rules.             |

`GridCell.traversal` is nullable for compatibility and records a required
medium, difficulty, foot suitability, and descriptive tags. Runtime
normalization guarantees a profile even for old cells. `TravelPlan` is stored
on the active Mission and contains its route, terrain legs, stops, chosen
transport, cursor, and estimated cost.

## Modeling Rules

- Define runtime schemas with Zod and infer TypeScript types.
- Prefer discriminated unions for actions, outcomes, state changes, and lifecycle states.
- Separate creation/generated-output schemas from authoritative persisted schemas when their trust boundaries differ.
- Keep the domain free of UI, LLM, orchestration, and database dependencies.
- Update Zod and Prisma representations together when persistence changes.
- If hierarchical locations are introduced, add explicit parent and semantic type fields; do not infer meaning solely from tree depth or map coordinates.
