import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  EnhancedWorldContext,
  GeneratedCharacter,
  GeneratedFaction,
} from '@talespin/schema';
import { characterPromptTemplate } from '../../src/prompts/characterPrompt.js';
import { factionPromptTemplate } from '../../src/prompts/generate-faction.js';
import { mapPromptTemplate } from '../../src/prompts/generate-map.js';
import { worldMapPrompt } from '../../src/prompts/world-map.js';
import {
  buildCharacterImagePrompt,
  buildFactionImagePrompt,
} from '../../src/prompts/world-assets.js';
import {
  buildCharacterGalleryImagePrompt,
  CHARACTER_DISTINCTION_DIRECTION,
  selectCharacterStagingCue,
} from '../../src/prompts/character-variation.js';

const styleMarkers = [
  'High-fidelity cinematic pixel art',
  'clearly visible square pixels',
  'crisp stepped contours',
  'no painterly brushstrokes',
  'photorealism',
  '3D rendering',
];

const assertHouseStyle = (prompt: string) => {
  styleMarkers.forEach((marker) => assert.match(prompt, new RegExp(marker)));
};

test('standalone map, faction, and character prompts share the house style', async () => {
  const prompts = await Promise.all([
    mapPromptTemplate.format({
      name: 'Pelagos',
      theme: 'hopeful ocean fantasy',
      description: 'A reef-ringed archipelago',
      settings: 'Sunken observatory and coral road',
    }),
    factionPromptTemplate.format({
      name: 'The Tidekeepers',
      category: 'faction',
      summary: 'Reef wardens',
      description: 'They maintain ancient sea paths.',
      tone: 'Luminous and vigilant',
      keywords: 'coral, lanterns',
      promptHint: 'Layered diving gear and shell tools',
    }),
    characterPromptTemplate.format({
      name: 'Mira',
      description: 'Reef scout',
      biography: 'Maps changing currents.',
      factions: 'The Tidekeepers',
      species: 'Human',
      archetypes: 'Navigator',
      traits: 'watchful, resourceful',
      promptHint: 'Amber diving hood and teal utility belt',
    }),
  ]);

  prompts.forEach(assertHouseStyle);
  assert.match(prompts[0]!, /strict top-down/i);
  assert.match(prompts[1]!, /readable at card size/i);
  assert.match(prompts[2]!, /not a tiny gameplay sprite/i);
  assert.match(prompts[2]!, /bespoke signature prop/i);
});

test('world blueprint map, faction, and character prompts share the house style', async () => {
  const context = {
    name: 'Pelagos',
    theme: 'fantasy',
    description:
      'A reef-ringed archipelago where harbor cities depend on luminous coral roads spanning warm shallows and abyssal trenches.',
    lore: {
      tagline: 'Every current carries a story.',
      tone: 'Wonder edged with danger',
      visualStyle: 'Shell-built settlements and luminous dive gear',
      currentTensions: [
        'The coral roads are failing',
        'Salvagers are waking ancient machines',
      ],
      history: 'The islands rose after the moonfall.',
      gameplayPillars: ['Explore changing reefs', 'Negotiate safe passage'],
      missionSeeds: [
        'Repair a broken coral road',
        'Recover a tide-powered relic',
        'Chart a newly opened trench',
      ],
    },
  } satisfies EnhancedWorldContext;
  const faction = {
    key: 'tidekeepers',
    faction: {
      name: 'The Tidekeepers',
      summary: 'Reef wardens',
      description: 'They maintain ancient sea paths.',
      category: 'faction',
      meta: {
        tone: 'Luminous and vigilant',
        keywords: ['coral', 'lanterns'],
        characterHooks: [],
      },
    },
  } as GeneratedFaction;
  const character = {
    key: 'mira',
    factionKey: 'tidekeepers',
    name: 'Mira',
    description: 'A reef scout who maps changing currents.',
    biography: 'She keeps the last safe route in memory.',
    promptHint: 'Amber diving hood and teal utility belt.',
    traits: ['watchful', 'resourceful'],
    meta: { descriptors: [], notes: 'Guide character' },
  } as GeneratedCharacter;

  const mapPrompt = await worldMapPrompt.format({
    name: context.name,
    theme: context.theme,
    description: context.description,
    tone: context.lore.tone,
    visualStyle: context.lore.visualStyle,
    currentTensions: context.lore.currentTensions.join('; '),
  });
  const prompts = [
    mapPrompt,
    buildFactionImagePrompt(context, faction),
    buildCharacterImagePrompt(context, character, faction),
  ];

  prompts.forEach(assertHouseStyle);
  prompts.forEach((prompt) => assert.match(prompt, /No visible text/));
  assert.match(prompts[2]!, /Character-specific staging cue/);
  assert.match(prompts[2]!, /actively holding, using, repairing, carrying/);
});

test('character staging is stable while different briefs produce varied cues', () => {
  const identities = [
    'Mira the reef scout with a tide compass',
    'Orun the elderly mushroom tender with a spore bell',
    'Kest the courier with a folding wind sail',
    'Sable the observatory mechanic with a lens wrench',
  ];
  const cues = identities.map(selectCharacterStagingCue);

  assert.equal(cues[0], selectCharacterStagingCue(identities[0]!));
  assert.ok(new Set(cues).size > 1);
});

test('gallery image prompts retain the planned pose and signature prop', () => {
  const prompt = buildCharacterGalleryImagePrompt({
    characterBrief: `Mira is a compact reef scout. ${CHARACTER_DISTINCTION_DIRECTION}`,
    signatureProp:
      'a scratched brass tide compass with three folding coral needles',
    stagingCue: selectCharacterStagingCue('Mira reef scout'),
    shot: {
      angle: 'Hero Action',
      summary: 'She braces against a current while reading the instrument.',
      prompt:
        'Mira twists into the current and opens all three coral needles with both hands.',
    },
  });

  assert.match(prompt, /scratched brass tide compass/);
  assert.match(prompt, /opens all three coral needles with both hands/);
  assert.match(prompt, /clear physical interaction/);
  assert.match(prompt, /No visible text/);
});
