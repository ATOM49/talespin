import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  Character,
  CharacterCreationInput,
  CharacterCreationSchema,
  CharacterForm,
  CharacterFormSchema,
  CharacterGallerySchema,
  CharacterGeneratedDetailsSchema,
  CharacterMetaSchema,
  CharacterProfileRequestSchema,
  PlayerCharacterCreationSchema,
  type CharacterImageRequestInput,
  type PlayerCharacterCreationInput,
} from '@talespin/schema';
import { ApiError } from './errors';
import { CharacterQueryParams, CharacterQueryParamsSchema } from './types';
import { ImageGenerationService } from './ai-image.service';
import { watcherHeaders } from './watcher-client';

const characterSelect = {
  select: {
    id: true,
    worldId: true,
    userId: true,
    name: true,
    description: true,
    biography: true,
    previewUrl: true,
    gallery: true,
    promptHint: true,
    traits: true,
    factionIds: true,
    cultureIds: true,
    speciesIds: true,
    archetypeIds: true,
    meta: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;

const CharacterGenerationResponseSchema = z.object({
  profile: CharacterGeneratedDetailsSchema,
  gallery: CharacterGallerySchema,
});

type PrismaCharacter = Prisma.CharacterGetPayload<typeof characterSelect>;
type AssociationReference = {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  category: string;
};

export class CharacterService {
  private readonly watcherBaseUrl: string;
  private readonly generationTimeout: number;

  constructor(
    private prisma: PrismaClient,
    options?: { watcherBaseUrl?: string; generationTimeoutMs?: number },
  ) {
    const configuredTimeout = Number(
      process.env.WATCHER_GENERATION_TIMEOUT_MS || 180000,
    );
    this.watcherBaseUrl =
      options?.watcherBaseUrl ||
      process.env.WATCHER_API_URL ||
      'http://localhost:4000';
    this.generationTimeout =
      options?.generationTimeoutMs ??
      (Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 180000);
  }

  async listCharacters(
    worldId: string,
    query?: CharacterQueryParams,
  ): Promise<Character[]> {
    const parsed = CharacterQueryParamsSchema.parse(query ?? {});

    const where: Prisma.CharacterWhereInput = {
      worldId,
    };

    const associationFilters: Prisma.CharacterWhereInput[] = [];

    if (parsed.search) {
      where.OR = [
        {
          name: { contains: parsed.search, mode: 'insensitive' },
        },
        {
          description: { contains: parsed.search, mode: 'insensitive' },
        },
      ];
    }

    if (parsed.factionId) {
      associationFilters.push({ factionIds: { has: parsed.factionId } });
    }

    if (parsed.cultureId) {
      associationFilters.push({ cultureIds: { has: parsed.cultureId } });
    }

    if (parsed.speciesId) {
      associationFilters.push({ speciesIds: { has: parsed.speciesId } });
    }

    if (parsed.archetypeId) {
      associationFilters.push({ archetypeIds: { has: parsed.archetypeId } });
    }

    if (associationFilters.length) {
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];
      where.AND = [...existingAnd, ...associationFilters];
    }

    const characters = await this.prisma.character.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: characterSelect.select,
    });

    return characters.map((character) => this.mapCharacterToDto(character));
  }

  async listPlayableCharacters(
    worldId: string,
    userId: string,
  ): Promise<Character[]> {
    const characters = await this.prisma.character.findMany({
      where: {
        worldId,
        OR: [{ userId: null }, { userId: { isSet: false } }, { userId }],
      },
      orderBy: { updatedAt: 'desc' },
      select: characterSelect.select,
    });

    return characters.map((character) => this.mapCharacterToDto(character));
  }

  async createPlayerCharacter(
    worldId: string,
    userId: string,
    data: PlayerCharacterCreationInput,
  ): Promise<Character> {
    const validated = PlayerCharacterCreationSchema.parse(data);
    const world = await this.prisma.world.findUnique({
      where: { id: worldId },
      select: { id: true },
    });

    if (!world) {
      throw new ApiError(404, 'World not found');
    }

    const character = await this.prisma.character.create({
      data: {
        worldId,
        userId,
        name: validated.name,
        description: validated.description || null,
        traits: [],
        factionIds: [],
        cultureIds: [],
        speciesIds: [],
        archetypeIds: [],
        meta: { descriptors: [] },
      },
      select: characterSelect.select,
    });

    return this.mapCharacterToDto(character);
  }

  async getCharacter(worldId: string, id: string): Promise<Character> {
    const character = await this.prisma.character.findUnique({
      where: { id },
      select: characterSelect.select,
    });

    if (!character || character.worldId !== worldId) {
      throw new ApiError(404, 'Character not found');
    }

    return this.mapCharacterToDto(character);
  }

  async createCharacter(
    worldId: string,
    data: CharacterCreationInput,
  ): Promise<Character> {
    const minimal = CharacterCreationSchema.parse(data);

    const speciesGroups = await this.resolveSpeciesGroups(
      worldId,
      minimal.speciesIds,
    );

    if (!speciesGroups.length) {
      throw new ApiError(400, 'Please select at least one valid species');
    }

    const generation = await this.synthesizeCharacter({
      name: minimal.name,
      description: minimal.description,
      species: speciesGroups,
    });

    if (!generation) {
      throw new ApiError(
        502,
        'Unable to generate character details. Please try again.',
      );
    }

    const { profile, gallery } = generation;
    const coverImage = gallery[0]?.imageUrl;

    const synthesized: CharacterForm = {
      name: minimal.name,
      description: minimal.description,
      biography: profile.biography,
      previewUrl: coverImage,
      gallery,
      promptHint: profile.promptHint,
      traits: profile.traits,
      factionIds: [],
      cultureIds: [],
      speciesIds: minimal.speciesIds,
      archetypeIds: [],
      meta: profile.meta,
    };

    const validated = CharacterFormSchema.parse(synthesized);

    const media = await this.buildCharacterMedia({
      worldId,
      form: validated,
    });

    const character = await this.prisma.character.create({
      data: {
        worldId,
        userId: null,
        name: validated.name,
        description: validated.description || null,
        biography: validated.biography || null,
        previewUrl: media.previewUrl || null,
        gallery: media.gallery.length
          ? (media.gallery as Prisma.InputJsonValue)
          : null,
        promptHint: validated.promptHint || null,
        traits: validated.traits,
        factionIds: validated.factionIds,
        cultureIds: validated.cultureIds,
        speciesIds: validated.speciesIds,
        archetypeIds: validated.archetypeIds,
        meta: (validated.meta as Prisma.InputJsonValue) || null,
      },
      select: characterSelect.select,
    });

    return this.mapCharacterToDto(character);
  }

  async getPlayerCharacter(
    worldId: string,
    userId: string,
  ): Promise<Character | null> {
    const character = await this.prisma.character.findFirst({
      where: { worldId, userId },
      select: characterSelect.select,
    });

    if (!character) {
      return null;
    }

    return this.mapCharacterToDto(character);
  }

  async upsertPlayerCharacter(
    worldId: string,
    userId: string,
    data: CharacterForm,
  ): Promise<Character> {
    const validated = CharacterFormSchema.parse(data);

    const existing = await this.prisma.character.findFirst({
      where: { worldId, userId },
      select: { id: true, previewUrl: true, gallery: true },
    });

    const media = await this.buildCharacterMedia({
      worldId,
      form: validated,
      existing: existing ?? undefined,
    });

    const payload = {
      name: validated.name,
      description: validated.description || null,
      biography: validated.biography || null,
      previewUrl: media.previewUrl || null,
      gallery: media.gallery.length
        ? (media.gallery as Prisma.InputJsonValue)
        : null,
      promptHint: validated.promptHint || null,
      traits: validated.traits,
      factionIds: validated.factionIds,
      cultureIds: validated.cultureIds,
      speciesIds: validated.speciesIds,
      archetypeIds: validated.archetypeIds,
      meta: (validated.meta as Prisma.InputJsonValue) || null,
    } satisfies Prisma.CharacterUpdateInput;

    if (existing) {
      const character = await this.prisma.character.update({
        where: { id: existing.id },
        data: payload,
        select: characterSelect.select,
      });
      return this.mapCharacterToDto(character);
    }

    const character = await this.prisma.character.create({
      data: {
        worldId,
        userId,
        ...payload,
      },
      select: characterSelect.select,
    });

    return this.mapCharacterToDto(character);
  }

  async updateCharacter(
    worldId: string,
    id: string,
    data: CharacterForm,
  ): Promise<Character> {
    const validated = CharacterFormSchema.parse(data);

    const existing = await this.prisma.character.findUnique({
      where: { id },
      select: { worldId: true, previewUrl: true, gallery: true },
    });

    if (!existing || existing.worldId !== worldId) {
      throw new ApiError(404, 'Character not found');
    }

    const media = await this.buildCharacterMedia({
      worldId,
      form: validated,
      existing,
    });

    const character = await this.prisma.character.update({
      where: { id },
      data: {
        name: validated.name,
        description: validated.description || null,
        biography: validated.biography || null,
        previewUrl: media.previewUrl || null,
        gallery: media.gallery.length
          ? (media.gallery as Prisma.InputJsonValue)
          : null,
        promptHint: validated.promptHint || null,
        traits: validated.traits,
        factionIds: validated.factionIds,
        cultureIds: validated.cultureIds,
        speciesIds: validated.speciesIds,
        archetypeIds: validated.archetypeIds,
        meta: (validated.meta as Prisma.InputJsonValue) || null,
      },
      select: characterSelect.select,
    });

    return this.mapCharacterToDto(character);
  }

  async deleteCharacter(worldId: string, id: string): Promise<void> {
    const existing = await this.prisma.character.findUnique({
      where: { id },
      select: { worldId: true },
    });

    if (!existing || existing.worldId !== worldId) {
      throw new ApiError(404, 'Character not found');
    }

    await this.prisma.character.delete({ where: { id } });
  }

  private async resolveSpeciesGroups(worldId: string, speciesIds: string[]) {
    const refs = await this.loadAssociationReferenceMap(worldId, speciesIds);

    return speciesIds
      .map((id) => refs.get(id))
      .filter((ref): ref is AssociationReference => Boolean(ref))
      .filter((ref) => ['species', 'entity'].includes(ref.category))
      .map((ref) => ({
        name: ref.name,
        summary: ref.summary || ref.description || undefined,
      }));
  }

  private async loadAssociationReferenceMap(
    worldId: string,
    ids: string[],
  ): Promise<Map<string, AssociationReference>> {
    if (!ids.length) {
      return new Map();
    }

    const records = await this.prisma.faction.findMany({
      where: {
        worldId,
        id: { in: ids },
      },
      select: {
        id: true,
        name: true,
        summary: true,
        description: true,
        category: true,
      },
    });

    return new Map(records.map((ref) => [ref.id, ref]));
  }

  private mapCharacterToDto(character: PrismaCharacter): Character {
    const meta = CharacterMetaSchema.parse(
      character.meta || { descriptors: [] },
    );

    return {
      _id: character.id,
      worldId: character.worldId,
      userId: character.userId || undefined,
      name: character.name,
      description: character.description || undefined,
      biography: character.biography || undefined,
      previewUrl: character.previewUrl || undefined,
      gallery: this.parseGallery(character.gallery),
      promptHint: character.promptHint || undefined,
      traits: character.traits || [],
      factionIds: character.factionIds || [],
      cultureIds: character.cultureIds || [],
      speciesIds: character.speciesIds || [],
      archetypeIds: character.archetypeIds || [],
      meta,
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    };
  }

  private async generateConceptGallery(
    worldId: string,
    data: CharacterForm,
  ): Promise<Character['gallery'] | null> {
    if (!data.description && !data.biography && data.traits.length === 0) {
      const hasAssociations =
        data.factionIds.length > 0 ||
        data.cultureIds.length > 0 ||
        data.speciesIds.length > 0 ||
        data.archetypeIds.length > 0;

      if (!hasAssociations && !data.promptHint) {
        return null;
      }
    }

    const payload = await this.buildImagePayload(worldId, data);

    if (!payload) {
      return null;
    }

    try {
      const service = new ImageGenerationService();
      const gallery = await service.generateCharacterGallery(payload);
      console.log({ gallery });

      if (gallery && gallery.length > 0) {
        return gallery;
      }

      return null;
    } catch (error) {
      console.error('Failed to generate character gallery:', error);
      return null;
    }
  }

  private parseGallery(value: Prisma.JsonValue | null | undefined) {
    const parsed = CharacterGallerySchema.safeParse(value ?? []);
    return parsed.success ? parsed.data : [];
  }

  private async synthesizeCharacter(
    input: z.input<typeof CharacterProfileRequestSchema>,
  ) {
    const payload = CharacterProfileRequestSchema.parse(input);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.generationTimeout,
    );

    try {
      const response = await fetch(
        `${this.watcherBaseUrl}/generate/character`,
        {
          method: 'POST',
          headers: watcherHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const details = await response.text();
        console.error('Character generation failed:', details);
        return null;
      }

      const data = await response.json();
      const parsed = CharacterGenerationResponseSchema.safeParse(data);

      if (!parsed.success) {
        console.error('Invalid character payload:', parsed.error);
        return null;
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Character generation timed out');
        return null;
      }

      console.error('Error generating character:', error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async buildCharacterMedia({
    worldId,
    form,
    existing,
  }: {
    worldId: string;
    form: CharacterForm;
    existing?: { previewUrl: string | null; gallery: Prisma.JsonValue | null };
  }): Promise<{ gallery: Character['gallery']; previewUrl: string | null }> {
    const providedGallery = form.gallery ?? [];
    const hasProvidedGallery = providedGallery.length > 0;
    const persistedGallery = existing
      ? this.parseGallery(existing.gallery)
      : [];

    let gallery = hasProvidedGallery ? providedGallery : persistedGallery;

    if (!gallery.length) {
      gallery = (await this.generateConceptGallery(worldId, form)) ?? [];
    }

    const previewUrl =
      form.previewUrl ?? gallery[0]?.imageUrl ?? existing?.previewUrl ?? null;

    return { gallery, previewUrl };
  }

  private async buildImagePayload(
    worldId: string,
    data: CharacterForm,
  ): Promise<CharacterImageRequestInput> {
    const associationIds = Array.from(
      new Set([
        ...data.factionIds,
        ...data.cultureIds,
        ...data.speciesIds,
        ...data.archetypeIds,
      ]),
    );

    const refs = await this.loadAssociationReferenceMap(
      worldId,
      associationIds,
    );

    const toGroup = (ids: string[], categories: string[]) =>
      ids
        .map((id) => refs.get(id))
        .filter((ref): ref is AssociationReference => Boolean(ref))
        .filter((ref) => categories.includes(ref.category))
        .map((ref) => ({
          name: ref.name,
          summary: ref.summary || ref.description || undefined,
        }));

    const factions = toGroup(data.factionIds, ['faction']);
    const cultures = toGroup(data.cultureIds, ['culture']);
    const species = toGroup(data.speciesIds, ['species', 'entity']);
    const archetypes = toGroup(data.archetypeIds, ['archetype', 'entity']);

    if (
      factions.length === 0 &&
      cultures.length === 0 &&
      species.length === 0 &&
      archetypes.length === 0 &&
      !data.promptHint
    ) {
      // Still allow generation with base description/traits
    }

    return {
      name: data.name,
      description: data.description,
      biography: data.biography,
      factions,
      cultures,
      species,
      archetypes,
      traits: data.traits,
      promptHint: data.promptHint,
    };
  }
}
