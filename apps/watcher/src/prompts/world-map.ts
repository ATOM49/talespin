import { PromptTemplate } from '@langchain/core/prompts';
import {
  HIGH_FIDELITY_PIXEL_ART_DIRECTION,
  TEXT_FREE_IMAGE_DIRECTION,
} from './pixel-art-direction.js';

export const worldMapPrompt = PromptTemplate.fromTemplate(`
Create a square, top-down illustrated world map for a persistent narrative game.

World: {name}
Premise: {description}
Tone: {tone}
Visual language: {visualStyle}
Current tensions: {currentTensions}

${HIGH_FIDELITY_PIXEL_ART_DIRECTION}

Map-specific direction:
- Strictly top-down view with no horizon, perspective tilt, isometric projection, frame, or decorative border.
- Fill the square canvas with distinct, legible geographic territories, natural borders, travel corridors, settlements, ruins, and environmental storytelling.
- The terrain should imply where societies could thrive and where missions could occur.
- Keep major silhouettes and routes readable beneath an 8 by 8 game grid while retaining rich pixel-cluster detail at full size.
- ${TEXT_FREE_IMAGE_DIRECTION} No grid lines.
`);
