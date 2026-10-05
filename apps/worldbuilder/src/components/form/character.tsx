'use client';
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '../ui/autoform';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { Character, CharacterFormSchema, Faction } from '@talespin/schema';
import { QueryKey, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Button } from '../ui/button';
import { X } from 'lucide-react';

interface CharacterFormComponentProps {
  worldId: string;
  characterId?: string;
  defaultValues?: Partial<Character>;
  onSuccess?: () => void;
  mutationResolver?: (context: { worldId: string; characterId?: string }) => {
    method: 'POST' | 'PUT';
    path: string | ((values: Partial<Character>) => string);
  };
  invalidateQueryKey?: QueryKey;
  submitLabel?: string;
}

function CharacterFormComponent({
  worldId,
  characterId,
  defaultValues,
  onSuccess,
  mutationResolver,
  invalidateQueryKey,
  submitLabel,
}: CharacterFormComponentProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(characterId);
  const schemaProvider = new ZodProvider(
    isEditing
      ? CharacterFormSchema
      : CharacterFormSchema.pick({ name: true, description: true }),
  );

  // Fetch all factions to populate dropdowns
  const { data: allFactions = [] } = useApiQuery<Faction[]>(
    `/api/worlds/${worldId}/factions`,
  );

  // Filter factions by category
  const factions = allFactions.filter((f) => f.category === 'faction');
  const cultures = allFactions.filter((f) => f.category === 'culture');
  const species = allFactions.filter((f) => f.category === 'species');
  const archetypes = allFactions.filter(
    (f) => f.category === 'archetype' || f.category === 'entity',
  );

  // Local state for selected IDs
  const [selectedFactionIds, setSelectedFactionIds] = useState<string[]>([]);
  const [selectedCultureIds, setSelectedCultureIds] = useState<string[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);
  const [selectedArchetypeIds, setSelectedArchetypeIds] = useState<string[]>(
    [],
  );
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Initialize from defaultValues
  useEffect(() => {
    if (defaultValues) {
      setSelectedFactionIds(defaultValues.factionIds ?? []);
      setSelectedCultureIds(defaultValues.cultureIds ?? []);
      setSelectedSpeciesIds(defaultValues.speciesIds ?? []);
      setSelectedArchetypeIds(defaultValues.archetypeIds ?? []);
    }
  }, [defaultValues]);

  const resolvedMutation = (
    mutationResolver ??
    ((ctx: { worldId: string; characterId?: string }) => ({
      method: ctx.characterId ? 'PUT' : 'POST',
      path: ctx.characterId
        ? () => `/api/worlds/${ctx.worldId}/characters/${ctx.characterId}`
        : `/api/worlds/${ctx.worldId}/characters`,
    }))
  )({ worldId, characterId });

  const mutation = useApiMutation<Character, Partial<Character>>(
    resolvedMutation.method,
    resolvedMutation.path,
    undefined,
    {
      onSuccess: (data) => {
        setStatus({
          type: 'success',
          message: `${data.name} ${isEditing ? 'updated' : 'created'} successfully.`,
        });
        if (invalidateQueryKey) {
          queryClient.invalidateQueries({ queryKey: invalidateQueryKey });
        } else {
          queryClient.invalidateQueries({
            queryKey: [`/api/worlds/${worldId}/characters`],
          });
        }
        onSuccess?.();
      },
      onError: (error) => {
        setStatus({
          type: 'error',
          message:
            error.message || 'Failed to save character. Please try again.',
        });
      },
    },
  );

  const handleSubmit = (values: Partial<Character>) => {
    setStatus(null);
    const payload: Partial<Character> = {
      ...values,
      speciesIds: selectedSpeciesIds,
    };

    if (isEditing) {
      payload.factionIds = selectedFactionIds;
      payload.cultureIds = selectedCultureIds;
      payload.archetypeIds = selectedArchetypeIds;
    }

    mutation.mutate(payload);
  };

  const sanitizedValues = defaultValues
    ? (() => {
        const clone: Partial<Character> = { ...defaultValues };
        delete clone._id;
        delete clone.worldId;
        delete clone.createdAt;
        delete clone.updatedAt;
        delete clone.userId;
        return clone;
      })()
    : undefined;

  const formValues = isEditing
    ? sanitizedValues
    : sanitizedValues
      ? {
          name: sanitizedValues.name,
          description: sanitizedValues.description,
        }
      : undefined;

  const addToSelection = (
    id: string,
    currentIds: string[],
    setter: (ids: string[]) => void,
  ) => {
    if (!currentIds.includes(id)) {
      setter([...currentIds, id]);
    }
  };

  const removeFromSelection = (
    id: string,
    currentIds: string[],
    setter: (ids: string[]) => void,
  ) => {
    setter(currentIds.filter((existingId) => existingId !== id));
  };

  const renderMultiSelect = (
    label: string,
    options: Faction[],
    selectedIds: string[],
    setter: (ids: string[]) => void,
  ) => {
    const availableOptions = options.filter(
      (opt) => !selectedIds.includes(opt._id),
    );

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedIds.map((id) => {
            const item = options.find((f) => f._id === id);
            return (
              <div
                key={id}
                className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded text-sm"
              >
                <span>{item?.name ?? id}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => removeFromSelection(id, selectedIds, setter)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
        {availableOptions.length > 0 && (
          <Select
            onValueChange={(value) =>
              addToSelection(value, selectedIds, setter)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((option) => (
                <SelectItem key={option._id} value={option._id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <AutoForm
        schema={schemaProvider}
        onSubmit={handleSubmit}
        values={formValues}
      >
        {status && (
          <Alert variant={status.type === 'error' ? 'destructive' : 'default'}>
            <AlertTitle>
              {status.type === 'error' ? 'Generation failed' : 'All set'}
            </AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        )}
        {isEditing &&
          renderMultiSelect(
            'Factions',
            factions,
            selectedFactionIds,
            setSelectedFactionIds,
          )}
        {isEditing &&
          renderMultiSelect(
            'Cultures',
            cultures,
            selectedCultureIds,
            setSelectedCultureIds,
          )}
        {renderMultiSelect(
          'Species',
          species,
          selectedSpeciesIds,
          setSelectedSpeciesIds,
        )}
        {isEditing &&
          renderMultiSelect(
            'Archetypes',
            archetypes,
            selectedArchetypeIds,
            setSelectedArchetypeIds,
          )}
        <Button type="submit" disabled={mutation.isLoading}>
          {submitLabel ||
            (characterId ? 'Update Character' : 'Create Character')}
        </Button>
      </AutoForm>
    </div>
  );
}

export default CharacterFormComponent;
