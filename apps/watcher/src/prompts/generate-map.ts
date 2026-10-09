import { PromptTemplate } from '@langchain/core/prompts';
import {
  HIGH_FIDELITY_PIXEL_ART_DIRECTION,
  TEXT_FREE_IMAGE_DIRECTION,
} from './pixel-art-direction.js';

const mapPromptTemplate = PromptTemplate.fromTemplate(`
Create a high-fidelity pixel-art world map viewed from directly above.

Description: {description}
Settings / Key Features: {settings}
World Name (Context Only - DO NOT RENDER AS TEXT): {name}

${HIGH_FIDELITY_PIXEL_ART_DIRECTION}

Map-specific direction:
- Use a strict top-down, bird's-eye projection throughout; no isometric horizon, perspective tilt, frame, or decorative border.
- Fill the complete square canvas with geography. Show distinct territories through natural terrain transitions rather than drawn boundary lines.
- Include readable mountains, forests, rivers, lakes, settlements, paths, landmarks, and environmental story details derived from the world description.
- Keep major landforms and travel routes legible at thumbnail size while rewarding close inspection with clustered pixel detail.
- Use the setting description to drive the palette and mood without weakening terrain readability.
- ${TEXT_FREE_IMAGE_DIRECTION}
`);

export { mapPromptTemplate };
