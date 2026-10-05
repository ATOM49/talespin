# Explorer Architecture

## Status

This document defines the implemented architecture for Talespin's explorer
flow. An explorer can choose a world-authored Character or create a
player-owned Character, start or resume a persisted Story, follow its three
Chapter timeline, and play the active terrain-aware Mission.
`StoryParticipant` records the User, Story, and selected Character without
changing Character ownership. Existing treasure-hunt models remain separate
precedents rather than aliases for the narrative models.

## Application Decision

Explorer remains inside `apps/worldbuilder`, the existing Next.js application.
Builder and explorer are two product surfaces over the same authentication,
World data, characters, grid, Prisma services, MongoDB database, and generated
media. A separate explorer application would add a service and authentication
boundary without an independently owned runtime today.

Use one top-level App Router root layout and nested layouts for builder and
explorer presentation. Route groups may organize the source tree without
changing public URLs. Do not create multiple root layouts merely to separate
the experiences because crossing root layouts causes a full page navigation.

The route surface is:

```text
/                                          choose build or explore
/worlds                                    builder world management
/worlds/[worldId]/...                              existing builder surface

/explore                                   explorer world selection
/explore/worlds/[worldId]/join                     implemented: choose/create a character
/explore/stories/[storyId]                         preparation and Chapter timeline
/explore/stories/[storyId]/missions/[missionId]    active terrain-aware Mission
```

An illustrative App Router organization is:

```text
app/
├── layout.tsx
├── (builder)/
│   └── worlds/...
└── (explorer)/
    └── explore/...
```

This is an organizational target, not a requirement to relocate existing
builder routes before explorer work begins.

The `/worlds` and `/explore` directories are deliberately distinct. The home
gateway switches the authenticated user's active role before entering either
surface; neither directory changes its behavior based on the other mode.

Reconsider a separate application only when explorer requires independent
deployment or scaling, a distinct authentication boundary, independent release
ownership, or a game server consumed exclusively through a stable remote API.

## Explorer Entry Flow

```text
Select World
    |
    v
Select existing Character or create a Character
    |
    v
Start or resume Story
    |
    v
Enter active Chapter
    |
    v
Play Mission through Interactions
```

Selecting a Character does not transfer ownership of that Character. A
`StoryParticipant`-style association should reference the authenticated User,
Story, and selected Character. This keeps character authorship, availability,
and active play selection as separate policies and allows future stories or
multiplayer rules without rewriting Character ownership.

Use the authenticated `User` as the player identity for new explorer state. Do
not build new Story or Mission persistence around the standalone legacy
`Player` model without first defining and implementing its relationship to
`User`.

## Narrative Ownership

The explorer flow uses the established hierarchy without collapsing its levels:

| Concept       | Explorer responsibility                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `World`       | Reusable setting containing the grid, regions, factions, locations, and world-authored characters.                                             |
| `Story`       | One durable narrative in a World, including participants, long-term state, known facts, consequences, and unresolved threads.                  |
| `Chapter`     | A progression phase in the Story with explicit state and one or more Missions.                                                                 |
| `Mission`     | The primary stateful gameplay loop with objectives, a route, budget, progress, and terminal evaluation.                                        |
| `Interaction` | The smallest playable unit at a point on the route, containing context, available actions, player action, outcome, and accepted state changes. |

A Story references a World; it does not copy or rename the World. Shared world
canon and player-specific narrative state must remain distinct:

- World state contains authored or promoted setting facts.
- Story state contains player-specific knowledge, relationships, consequences,
  inventory, discoveries, and introduced characters.
- Chapter state contains progression for the current narrative phase.
- Mission state contains route and objective progress.
- Interactions form the durable action and outcome history.

Dynamically proposed characters receive stable identities and are scoped to the
Story by default. They must not silently become shared World canon. Promoting a
Story character into the reusable World should be an explicit builder action.

## Mission Shape

Each Chapter has one replayable Mission from one grid cell to another. It
contains:

- a Chapter and Story reference;
- an `ACTIVE | SUCCESS | FAILED` lifecycle;
- one or more structured objectives;
- start and destination cell references;
- an ordered, validated route across adjacent grid-cell references;
- terrain legs, stops, chosen transport, and an estimated action cost;
- the current path index or current cell reference;
- an action or interaction budget where required;
- terminal timestamps and failure details;
- ordered Interaction references.

The model may propose the mission premise, destination intent, encounter seeds,
or constraints. Deterministic TypeScript behavior selects or validates the
actual route, classifies terrain, segments travel legs, verifies transport,
advances the path cursor, applies per-cell cost, and evaluates objective
predicates. `walkable=false` is compatible legacy metadata; it requests
transport rather than blocking the cell.

Each configured point on the path creates an Interaction opportunity. The
route may be planned up front, but the Interaction is generated when reached so
that it can use current Story, Chapter, Mission, location, character, discovery,
and prior-outcome state.

Interaction target and Interaction kind are separate concepts. The first slice
needs targets such as `WORLD` and `CHARACTER`; kinds may include `EXPLORATION`,
`DIALOGUE`, `DECISION`, and `DISCOVERY`. A character target references either a
world-authored Character or a Story-scoped generated character by stable ID.

## Runtime Boundaries

```text
Explorer UI and route handlers
             |
             v
worldbuilder application services and Prisma repositories
        |                                      |
        v                                      v
packages/game-engine                      apps/watcher
deterministic transitions                typed generation proposals
        |                                      |
        +------------------+-------------------+
                           v
                    packages/schema
```

`packages/game-engine` owns pure, testable behavior for path validation, legal
movement, budgets, objective evaluation, accepted state changes, and terminal
status. It does not call models or persist data.

Worldbuilder application services own authorization, idempotency, loading
authoritative state, invoking the game engine and watcher, transaction
boundaries, and DTO mapping. Prisma remains in worldbuilder until another real
application requires the same repositories.

Watcher owns Talespin-specific generation prompts and chains. It may propose a
Mission brief, Interaction situation, generated character, player-action
interpretation, narrative explanation, or semantic outcome. Every meaningful
proposal crosses a Zod schema before deterministic evaluation. Watcher never
persists or directly mutates authoritative gameplay state.

## Interaction Request Boundary

Each player action is a durable request boundary:

1. Authorize the User against the Story and active Character.
2. Load the current Story, Chapter, Mission, and pending Interaction.
3. Normalize structured or free-form input into a typed player action carrying
   an action ID and expected Mission version.
4. Reject stale, out-of-turn, or mechanically illegal actions and replay the
   canonical result for duplicate action IDs.
5. Ask watcher for a typed semantic proposal only when generation is required.
6. Validate the proposal and let the game engine accept, reject, or constrain
   state changes.
7. Persist the action, outcome, accepted changes, and updated Mission state in
   one idempotent application transaction.
8. Evaluate Mission termination, then propagate accepted consequences to
   Chapter and Story state.
9. Generate or enqueue the next Interaction only when the Mission continues.

Persist enough state to resume after process restarts or disconnected clients.
No in-memory model conversation, agent thread, or generated prose is the source
of truth.

## Orchestration and Agent Frameworks

Use existing LangChain runnables or direct structured model calls for the first
generation operations. Do not introduce Deep Agents into the authoritative
Mission loop: its open-ended planning, subagents, filesystem context, and
generic memory do not replace Story state or deterministic transitions.

LangGraph may be introduced once an executable workflow needs durable
branching, retries, parallel generation, or an explicit player interrupt/resume
boundary. Its graph state should contain workflow context and stable IDs, not a
second copy of the domain model.

Deep Agents may later serve bounded, non-authoritative workflows such as
builder-assisted Chapter planning or automated Mission play-testing. Those
workflows must still return typed proposals through the same validation and
game-engine boundary.

## Implemented Sequence

1. `packages/schema` defines Story, Chapter, Mission, Interaction, travel,
   action, outcome, state-change, player-view, and generation contracts.
2. `packages/game-engine` supplies pure terrain, route, transport, objective,
   and state-transition rules with focused tests.
3. Prisma and worldbuilder application services persist leased narrative jobs,
   versioned attempts, idempotent actions, and transaction boundaries.
4. Explorer provides world and character selection, Story preparation, a
   Chapter timeline, and the active full-map Mission route.
5. Watcher returns typed outline, Mission setup, Interaction, character, and
   action-resolution proposals.
6. LangGraph remains deferred while the persisted application state machine
   expresses the durable control flow clearly.

Every slice should keep Zod and Prisma representations aligned and test
transitions independently from generated prose.
