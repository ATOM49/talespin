import type { NarrativeGenerationRequest } from '@talespin/schema';

export function narrativePrompt(request: NarrativeGenerationRequest): string {
  const rules = [
    'You are the game master for Talespin, a persistent narrative exploration game.',
    'Return only the requested structured data.',
    'Treat supplied state as authoritative and never invent IDs.',
    'Keep prose vivid but concise and suitable for a short three-chapter arc.',
  ].join('\n');

  if (request.kind === 'OUTLINE') {
    return `${rules}\nCreate exactly three sequential chapters: opening, escalation, and finale. Do not choose a finale map cell yet.\nContext:\n${JSON.stringify(request.input, null, 2)}`;
  }
  if (request.kind === 'MISSION_SETUP') {
    return `${rules}\nCreate one focused mission for this chapter. destinationHint must refer to supplied cell names, biomes, or tags without inventing a cell ID. Include a character encounter and a discovery.\nContext:\n${JSON.stringify(request.input, null, 2)}`;
  }
  if (request.kind === 'INTERACTION') {
    return `${rules}\nCreate a blocking ${request.input.isFinale ? 'finale' : 'character or discovery'} interaction at the supplied cell. Offer 2-4 materially different choices.\nContext:\n${JSON.stringify(request.input, null, 2)}`;
  }
  if (request.kind === 'TRANSPORT') {
    return `${rules}\nOffer 2-3 memorable, lore-fitting ways to cross the required terrain. Every option must include the exact required traversal medium in supportedMedia, use a stable kebab-case ID, and have a positive per-cell action cost. Ownership is not required.\nContext:\n${JSON.stringify(request.input, null, 2)}`;
  }
  return `${rules}\nResolve the supplied player action. Propose only facts, story-local item use, relationships, threads, consequences, and listed objective IDs that follow from the situation. If free text is unsupported, impossible, or unrelated, return accepted=false with a concise clarification and no state changes.\nContext:\n${JSON.stringify(request.input, null, 2)}`;
}
