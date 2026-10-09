# Game Context

## Status

This document combines the current Talespin product with its narrative-game direction. Sections marked **Current** describe implemented repository behavior. Sections marked **Target** guide future work and must not be presented as already shipped.

## Product Concept

**Current:** Talespin is a collaborative worldbuilding application. A builder can seed a persistent world from an optional name and short setting description; the generation service expands that seed into a world bible, map, image-grounded regions, factions, faction territory, and recurring characters. Generated maps, factions, and characters share a high-fidelity cinematic pixel-art direction; characters receive identity-stable pose language and story-derived signature props. Builders can also edit the map grid, locations, cultures, species, archetypes, and characters individually. Builder and explorer roles already distinguish content creation from play-oriented access.

**Current explorer slice:** Talespin also runs a persistent, single-player,
three-Chapter Story. The explorer travels cell by cell, meets world-authored or
Story-scoped characters, resolves typed Interactions, completes Mission
objectives, and reaches a state-selected Chapter 3 finale. The initial slice is
an explicit state machine; tactical combat, multiplayer, and character
promotion remain targets.

Narrative prose is a view over game state. Authoritative state must not be reconstructed solely from prose.

## Narrative Hierarchy

The implemented hierarchy is:

```text
Story
└── Chapters
    └── Missions
        └── Interactions
```

- A **Story** owns the plot, world reference, major characters, chapters, long-term state, and unresolved threads.
- A **Chapter** advances a phase of the Story using existing state. It may introduce locations, characters, and several missions.
- A **Mission** is the primary stateful gameplay loop, with objectives and explicit success or failure conditions.
- An **Interaction** is the smallest playable unit: dialogue, exploration, combat, investigation, decision, puzzle, skill check, or discovery.

`Story`, `StoryParticipant`, `Chapter`, `Mission`, `Interaction`,
`StoryCharacter`, and `NarrativeJob` have matching Zod and Prisma
representations. Existing treasure-hunt types remain separate precedents.

## Terrain-Aware Travel

Every grid cell is selectable. `walkable` remains for compatibility but is not
an impassability flag. Explicit traversal metadata wins; biome, name, and tags
provide deterministic classification next; the legacy flag is only the final
fallback. Routes still cross adjacent cells. Terrain legs that are unsuitable
for walking pause before entry and offer mechanically valid contextual
transport, with deterministic fallbacks when generation is unavailable.

## Current Gameplay Precedent

The treasure-hunt model is the closest implemented domain precedent:

- `TreasureHuntRun` stores status, action budget, position, path, discoveries, and terminal timestamps.
- `TreasureHuntEvent` records `MOVE` and `EXPLORE` actions with structured payloads.
- `PlayerWorldExploration` preserves discoveries and aggregate run progress.

This is narrower than the target Mission/Interaction model, but it demonstrates the required pattern: persistent state plus explicit events and terminal evaluation.

## Persistent Consequences

Future interactions should be able to propose explicit changes such as character disposition or knowledge, location access, inventory ownership, faction attitude, discoveries, and objective progress. Validated game logic applies those changes; later generation receives the updated state and must not contradict it.
