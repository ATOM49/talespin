import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GeneratedCharacterBatchSchema,
  GeneratedFactionBatchSchema,
} from '@talespin/schema';

const character = {
  key: 'storm-reader',
  factionKey: 'lighthouse-guild',
  name: 'Ilyra Venn',
  description: 'A navigator who hears warnings in thunder.',
  biography: 'Ilyra charts the paths of the sleeping sea giants.',
  promptHint: 'Storm-lit navigator in weathered ceremonial oilskins.',
  traits: ['watchful', 'defiant'],
  meta: {
    descriptors: [
      { label: 'Demeanor', detail: 'Calm while everyone else panics.' },
      { label: 'Secret', detail: 'One giant speaks directly to her.' },
    ],
    notes: 'Use her as a guide into contested waters.',
  },
};

test('character generation requires every declared metadata field', () => {
  assert.equal(
    GeneratedCharacterBatchSchema.safeParse({ characters: [character] })
      .success,
    true,
  );

  const { notes: _notes, ...metaWithoutNotes } = character.meta;
  assert.equal(
    GeneratedCharacterBatchSchema.safeParse({
      characters: [{ ...character, meta: metaWithoutNotes }],
    }).success,
    false,
  );
});

test('generation drafts remove asset URLs from structured model output', () => {
  const parsed = GeneratedFactionBatchSchema.parse({
    factions: [
      {
        key: 'lighthouse-guild',
        faction: {
          name: 'The Lighthouse Guild',
          summary: 'Storm readers guarding the sleeping giants.',
          description: 'A maritime order divided by competing prophecies.',
          previewUrl: 'https://example.com/emblem.png',
          category: 'faction',
          meta: {
            tone: 'Severe and ritualistic',
            keywords: ['storms', 'navigation'],
            characterHooks: [
              {
                title: 'Storm Reader',
                description: 'A navigator who interprets giant dreams.',
              },
            ],
          },
        },
      },
      {
        key: 'wakebound',
        faction: {
          name: 'The Wakebound',
          summary: 'Pilgrims seeking the giants awakening.',
          description: 'A fleet of zealots who treat earthquakes as scripture.',
          category: 'faction',
          meta: {
            tone: 'Fervent',
            keywords: ['pilgrims'],
            characterHooks: [],
          },
        },
      },
      {
        key: 'tide-court',
        faction: {
          name: 'The Tide Court',
          summary: 'Merchants who tax every safe passage.',
          description: 'An alliance of harbor rulers and salvage dynasties.',
          category: 'faction',
          meta: {
            tone: 'Opulent',
            keywords: ['trade'],
            characterHooks: [],
          },
        },
      },
    ],
  });

  assert.equal('previewUrl' in parsed.factions[0]!.faction, false);
});
