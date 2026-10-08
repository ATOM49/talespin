import { PromptTemplate } from '@langchain/core/prompts';

export const enhanceWorldPrompt = PromptTemplate.fromTemplate(`
You are the lead narrative designer for a persistent generative role-playing world.

Turn the builder's small seed into one coherent setting bible. Preserve their intent, but reason through the consequences so geography, societies, conflicts, characters, and future missions can all grow from the same foundations.

Builder seed
- Optional name: {name}
- Description: {description}

Requirements
- Create a memorable name only when the builder did not provide one.
- Derive the geography, societies, tone, and visual style from the setting description. Keep the setting reusable for different stories and themes; do not impose a single overarching plot or narrative theme.
- The main description should explain the world's defining premise, physical reality, inhabitants, pressures, and the uneasy status quo in 3-5 substantial paragraphs.
- Current tensions must create several sides with understandable motives, not a simple good-versus-evil split.
- Gameplay pillars should describe repeatable player activities.
- Mission seeds should be specific situations with a place, interested parties, and a consequential choice.
- Keep every field mutually consistent and useful as downstream generation context.
`);
