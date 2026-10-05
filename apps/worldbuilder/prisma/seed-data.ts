import type { FactionForm, WorldForm } from '@talespin/schema';

// Shared seed data for Middle-earth factions
export const MIDDLE_EARTH_FACTIONS: Array<Omit<FactionForm, 'previewUrl'>> = [
  {
    name: 'Elves',
    category: 'species' as const,
    summary:
      'The Firstborn, immortal and wise, keepers of ancient knowledge and craft.',
    description: `The Elves, known as the Firstborn Children of Ilúvatar, are an ancient and noble race blessed with immortality and ageless beauty. They possess an innate connection to nature and magic, creating works of unparalleled artistry and wonder.

Elven society values wisdom, beauty, and preservation of knowledge. They are master craftsmen, skilled archers, and keepers of ancient lore. Their long lives grant them perspective and patience that mortals cannot comprehend, though this also brings a weariness of the world.

Most Elves have begun the journey West to the Undying Lands, leaving Middle-earth to the dominion of Men. Those who remain do so out of duty, love, or unfinished purpose, knowing their time in the mortal world is drawing to a close.`,
    meta: {
      tone: 'Ethereal, melancholic, graceful, timeless',
      keywords: [
        'immortal',
        'ageless',
        'beautiful',
        'wise',
        'magical',
        'artistic',
        'nature-bound',
        'declining',
        'ancient',
        'graceful',
      ],
      characterHooks: [
        {
          title: 'Woodland Sentinel',
          description:
            'An elven ranger who patrols the forest borders, silent and watchful. They move through trees like shadow, their arrows never missing their mark.',
        },
        {
          title: 'Loremaster Scholar',
          description:
            'A keeper of ancient texts and songs, preserving knowledge from the Elder Days. They speak in riddles and poetry, their memory spanning millennia.',
        },
        {
          title: 'Reluctant Warrior',
          description:
            'An elf who has seen too many ages of war and longs for peace. They fight with sorrow in their heart, each battle a reminder of what is being lost.',
        },
        {
          title: 'Star-gazing Mystic',
          description:
            'A contemplative soul who reads the movements of celestial bodies and remembers when they were first kindled. They offer cryptic guidance drawn from cosmic patterns.',
        },
        {
          title: 'Master Craftsman',
          description:
            'An elven smith or jeweler whose works seem to contain light itself. They create beauty that will outlast kingdoms, though few remain who appreciate their art.',
        },
      ],
    },
  },
  {
    name: 'Dwarves',
    category: 'species' as const,
    summary:
      'Stout and stubborn craftsmen of stone and metal, proud guardians of mountain halls.',
    description: `The Dwarves are a sturdy and proud race, children of Aulë the Smith, created to endure the harshness of stone and forge. They are master craftsmen, miners, and warriors, with an unbreakable will and a memory for grudges that spans generations.

Dwarven culture revolves around clan loyalty, honor, and the pursuit of craft. They build vast underground kingdoms within mountains, delving deep for precious metals and gems. Their halls are marvels of engineering and artistry, filled with treasures both beautiful and deadly.

Though short in stature, dwarves possess tremendous strength and endurance. They are suspicious of outsiders, especially Elves with whom they share an ancient mistrust, yet they honor their oaths with absolute dedication. A dwarf's word is as solid as the mountains they call home.

In recent ages, many great Dwarven realms have fallen to darkness, dragon-fire, or their own greed. The surviving clans maintain their traditions while dealing with loss, exile, and the ever-present desire to reclaim their ancestral homes.`,
    meta: {
      tone: 'Gruff, steadfast, prideful, industrious',
      keywords: [
        'stout',
        'stubborn',
        'loyal',
        'craftsmen',
        'miners',
        'warriors',
        'honorable',
        'grudge-bearing',
        'mountain-folk',
        'treasure-seekers',
      ],
      characterHooks: [
        {
          title: 'Exiled Warrior',
          description:
            'A battle-scarred dwarf whose home was destroyed, now seeking either vengeance or a new purpose. They carry the weight of their fallen clan with every step.',
        },
        {
          title: 'Master Smith',
          description:
            'A craftsman obsessed with perfecting their art, capable of forging weapons and armor of legendary quality. They judge others by the quality of their tools.',
        },
        {
          title: 'Tunnel Scout',
          description:
            'An expert in underground navigation who can read stone like others read books. They know every secret passage and hidden vein of ore in their territory.',
        },
        {
          title: 'Grudge-keeper',
          description:
            'A dwarf who maintains the Book of Grudges, never forgetting a slight against their clan. They demand restitution for wrongs both recent and ancient.',
        },
        {
          title: 'Treasure Hunter',
          description:
            'Driven by tales of lost hoards and ancient treasures, this dwarf explores dangerous ruins and forgotten depths. Their greed is matched only by their courage.',
        },
      ],
    },
  },
  {
    name: 'Rivendell',
    category: 'faction' as const,
    summary:
      'The Last Homely House, a refuge of elven wisdom and hospitality in the wild.',
    description: `Rivendell, also known as Imladris, is a hidden valley sanctuary ruled by Elrond Half-elven. It serves as a refuge for travelers and a repository of ancient knowledge, where the wise gather to counsel against the growing darkness.

The house is renowned for its hospitality, healing, and lore. Here, the fragments of history are preserved in song and scroll, and great decisions are made that shape the fate of Middle-earth. The valley itself seems timeless, protected by Elven magic and the power of Vilya, mightiest of the Three Rings.

Those who dwell in Rivendell are scholars, healers, and keepers of memory. They offer aid to those who fight against shadow, providing wisdom, provisions, and sometimes reluctant warriors for necessary causes.`,
    meta: {
      tone: 'Peaceful, wise, welcoming, contemplative',
      keywords: [
        'sanctuary',
        'healing',
        'lore',
        'hospitality',
        'council',
        'hidden',
        'timeless',
        'scholarly',
      ],
      characterHooks: [
        {
          title: 'Healer of Hurts',
          description:
            'A gentle soul skilled in tending wounds both physical and spiritual. They offer comfort and herbal remedies to weary travelers.',
        },
        {
          title: 'Council Advisor',
          description:
            'A dignified elf who has witnessed ages of history and offers measured counsel. They speak with authority earned through millennia of experience.',
        },
        {
          title: 'Minstrel of Memory',
          description:
            'A keeper of songs who preserves history through music and verse. Their performances can move hearts and recall forgotten truths.',
        },
      ],
    },
  },
  {
    name: 'Khazad-dûm',
    category: 'faction' as const,
    summary:
      'The greatest Dwarven realm, now fallen to darkness and known as Moria.',
    description: `Khazad-dûm, called Moria by the Elves, was once the greatest mansion of the Dwarves. Delved beneath the Misty Mountains, it was a realm of unimaginable wealth and beauty, filled with mithril and works of wonder.

The ancient kingdom fell when the Dwarves delved too deep and awoke a Balrog of Morgoth. The realm was abandoned, its halls becoming a place of darkness and terror. Orcs and worse things now inhabit the once-proud kingdom.

Dwarves of Durin's line still dream of reclaiming their ancestral home, though none have succeeded. The name Moria carries weight for all dwarves—a reminder of lost glory and the dangers of unchecked ambition.`,
    meta: {
      tone: 'Tragic, grand, haunted, prideful',
      keywords: [
        'fallen',
        'mithril',
        'ancient',
        'cursed',
        'ambitious',
        'haunted',
        'glorious',
        'lost',
      ],
      characterHooks: [
        {
          title: 'Reclamation Zealot',
          description:
            'A dwarf obsessed with retaking Moria, gathering allies and resources for an expedition. They refuse to accept that their ancestral home is truly lost.',
        },
        {
          title: 'Last Survivor',
          description:
            'One of the few who escaped when Balin attempted to recolonize Moria. They carry survivor guilt and terrible knowledge of what lurks in the deep.',
        },
      ],
    },
  },
  {
    name: 'Rangers of the North',
    category: 'archetype' as const,
    summary:
      'Secretive wanderers who protect the Free Peoples from the shadows.',
    description: `The Rangers of the North are the remnants of the Dúnedain, descendants of the kingdom of Arnor. They are skilled trackers, warriors, and scouts who patrol the wild lands, protecting the innocent from threats they never see.

These grim wanderers are often mistaken for vagabonds, yet they carry noble blood and ancient purpose. They serve without recognition or reward, guided by their chieftain and the burden of their heritage.`,
    meta: {
      tone: 'Grim, noble, secretive, weathered',
      keywords: [
        'tracker',
        'wanderer',
        'protector',
        'noble',
        'secretive',
        'vigilant',
        'wilderness',
      ],
      characterHooks: [
        {
          title: 'Weathered Scout',
          description:
            'A lean ranger who knows every path and danger in the Wild. They appear from nowhere to warn of approaching threats, then vanish just as quickly.',
        },
        {
          title: 'Keeper of Bloodlines',
          description:
            'A ranger who maintains knowledge of the scattered Dúnedain and their ancient heritage. They work to preserve what remains of Arnor nobility.',
        },
      ],
    },
  },
];

export const MIDDLE_EARTH_WORLD: WorldForm = {
  name: 'Middle-earth',
  theme: 'fantasy',
  description:
    'A vast realm of legendary heroes, ancient kingdoms, and timeless struggles between light and shadow. From the peaceful Shire to the dark lands of Mordor, Middle-earth is a world of wonder, danger, and profound beauty.',
  settings: {
    key: 'middle-earth',
    name: 'Middle-earth',
    version: 'Third Age',
  },
};
