import type {
  EnhancedWorldContext,
  GeneratedCharacter,
  GeneratedFaction,
} from '@talespin/schema';
import {
  HIGH_FIDELITY_PIXEL_ART_DIRECTION,
  TEXT_FREE_IMAGE_DIRECTION,
} from './pixel-art-direction.js';
import {
  CHARACTER_DISTINCTION_DIRECTION,
  selectCharacterStagingCue,
} from './character-variation.js';

export const buildFactionImagePrompt = (
  context: EnhancedWorldContext,
  generated: GeneratedFaction,
) => {
  const faction = generated.faction;
  return `A representative key-art image for ${faction.name}, an organization in ${context.name}. ${faction.summary} ${faction.description} Tone: ${faction.meta.tone}. World-specific motifs: ${context.lore.visualStyle}. ${HIGH_FIDELITY_PIXEL_ART_DIRECTION} Show one strong emblematic focal point: a gathering, headquarters, ritual, equipment, or contested activity that reveals how the organization lives and operates. Keep the main silhouette readable at card size, supported by cohesive pixel-art environmental storytelling. ${TEXT_FREE_IMAGE_DIRECTION} Render the image itself; do not display or typeset this brief.`;
};

export const buildCharacterImagePrompt = (
  context: EnhancedWorldContext,
  generated: GeneratedCharacter,
  faction: GeneratedFaction,
) => {
  const stagingCue = selectCharacterStagingCue(
    `${context.name}:${generated.key}:${generated.name}:${generated.promptHint}`,
  );

  return `Single-character full-body portrait of ${generated.name} from ${faction.faction.name} in ${context.name}. ${generated.description} ${generated.promptHint}. Traits: ${generated.traits.join(', ')}. World-specific motifs: ${context.lore.visualStyle}. ${HIGH_FIDELITY_PIXEL_ART_DIRECTION} ${CHARACTER_DISTINCTION_DIRECTION} Character-specific staging cue: ${stagingCue} Exactly one character with a clear, anatomy-aware silhouette, setting-appropriate clothing and tools, and grounded lived-in detail rendered as intentional pixel clusters. Polished portrait key art rather than a tiny gameplay sprite or sprite sheet. Portrait-oriented composition with a restrained pixel-art environmental backdrop, no duplicates, reflections, or crowd. ${TEXT_FREE_IMAGE_DIRECTION}`;
};
