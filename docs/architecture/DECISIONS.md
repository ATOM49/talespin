# Architecture Decisions

This file records current and target decisions imported from the product design context. “Accepted (target)” means the direction is intentional but not fully implemented.

## ADR-001: Zod is the runtime contract source of truth

**Status:** Accepted (current)

Shared request, generation, and domain boundaries use schemas from `packages/schema`; TypeScript types should be inferred where practical. Persisted Prisma models must be updated alongside their Zod counterparts.

## ADR-002: Story owns the plot and references a World

**Status:** Accepted (current)

The `Story` aggregate owns the explorer's world-specific narrative state,
participation, plot progression, Chapters, Mission attempts, and completion.
`World` remains the reusable setting and must not be renamed or duplicated.

## ADR-003: Missions are iterative gameplay loops

**Status:** Accepted (current)

A Mission evolves through player-driven Interactions and explicit terminal evaluation. It is not generated upfront as a static sequence. `TreasureHuntRun` and `TreasureHuntEvent` are the current precedent for durable loop state plus events.

## ADR-004: LLMs do not directly mutate authoritative state

**Status:** Accepted (current)

Models may generate narrative, interpret actions, and propose typed outcomes or changes. Zod validates the proposal; deterministic logic evaluates it; application services persist accepted transitions.

## ADR-005: Deterministic gameplay gets an independent boundary

**Status:** Accepted (current)

Mission rules, objectives, action validation, state changes, traversal, and inventory mechanics are implemented as pure functions in `packages/game-engine` and are testable without an LLM.

## ADR-006: Orchestration is not the domain model

**Status:** Accepted (target)

LangChain or a future LangGraph workflow coordinates operations but does not become the source of truth for entities or rules. Graph nodes delegate to typed domain and engine functions.

## ADR-007: Location hierarchy is explicit

**Status:** Accepted (target)

Current locations are flat points with relative coordinates. A future hierarchy must use explicit parent references and semantic location types such as region, settlement, building, or room; semantics must not be inferred solely from depth.

## ADR-008: Extract packages only around real ownership

**Status:** Accepted (current)

Prisma remains in worldbuilder and generation remains in watcher until multiple consumers justify extraction. `packages/game-engine` is the concrete exception because worldbuilder consumes its tested deterministic rules. Do not create empty `agents`, `persistence`, or `shared` packages solely to match a diagram.

## ADR-009: Regions are semantic grid territories

**Status:** Accepted (current)

A Region owns explicit references to one or more persisted grid cells and normalized map crop bounds. Region descriptions may be proposed from image cut-outs, but deterministic partitioning must cover every grid cell exactly once before persistence. Faction presence is an explicit region field with influence and rationale; it must reference factions created in the same world.

## ADR-010: Generated art uses one shared visual contract

**Status:** Accepted (current)

Map, faction, and character generation share a descriptive high-fidelity pixel-art contract owned by watcher prompts. Asset-specific composition may differ, but standalone and world-blueprint paths must reuse the same rendering and text-free constraints. Character variation is deterministic per identity/context and preserves one story-derived signature prop across gallery angles. Provider adapters remain visual-style agnostic, and prompt/provider/model/size changes produce distinct CDN cache identities.

## ADR-011: Explorer remains in the existing web application

**Status:** Accepted (current)

Builder and explorer are separate route and presentation surfaces inside
`apps/worldbuilder`, sharing one top-level Next.js root layout, authentication,
World data, Prisma services, MongoDB, and generated media. Route groups and
nested layouts may organize each surface. Create a separate explorer
application only when independent deployment, scaling, ownership,
authentication, or a stable remote game-server boundary justifies it.

## ADR-012: Character selection is Story participation

**Status:** Accepted (current)

Selecting an existing or player-created Character for play must create a typed
association between the Story, authenticated User, and Character. Do not
overload Character authorship or `Character.userId` to represent active
selection. New explorer persistence uses User as player identity unless the
legacy standalone Player model is deliberately reconciled with User.

## ADR-013: Generated narrative characters are Story-scoped

**Status:** Accepted (current)

Characters generated during Interactions receive stable identities and belong
to the player's Story by default. They do not silently mutate shared World
canon. Promotion into the reusable World is an explicit builder operation.

## ADR-014: Agent harnesses do not own the gameplay loop

**Status:** Accepted (current)

The authoritative Mission loop remains typed, persisted, and deterministic.
Use LangChain for focused generation and consider LangGraph when executable
orchestration requires durable branching or interrupt/resume. Deep Agents may
support bounded planning or play-testing workflows, but its plans, memory, and
subagents are never authoritative Story, Mission, or Interaction state.

## ADR-015: Every map cell is reachable through terrain-aware travel

**Status:** Accepted (current)

`GridCell.walkable` remains backward-compatible metadata, not a hard wall.
Explicit traversal metadata wins over deterministic biome, name, and tag
classification; `walkable` is only the legacy fallback. Routes cross adjacent
cells and pause before special terrain until the player selects a mechanically
valid transport. Deterministic fallback options prevent model failures from
making a destination unreachable.

## ADR-016: Serverless hosts run generation jobs inline

**Status:** Accepted (current)

Leased MongoDB jobs stay the only generation dispatch mechanism. The runner is
a deployment choice: long-running workers where processes can stay up, and
`inline` on Vercel, where routes that enqueue or poll jobs drain the queue
after responding (`scheduleGenerationJobs`) and a daily cron recovers anything
left over. Leases make overlapping runners safe. Inline runs are bounded by
the function duration limit, so generation timeouts must fit inside it.
Watcher requests require a shared `WATCHER_API_KEY` because a serverless
watcher is publicly reachable.
