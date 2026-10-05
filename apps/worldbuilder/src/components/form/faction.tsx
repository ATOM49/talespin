'use client';
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '../ui/autoform';
import { useApiMutation } from '@/hooks/useApiQuery';
import { Faction, FactionFormSchema } from '@talespin/schema';
import { useQueryClient } from '@tanstack/react-query';

interface FactionFormComponentProps {
  worldId: string;
  factionId?: string;
  defaultValues?: Partial<Faction>;
  onSuccess?: () => void;
}

function FactionFormComponent({
  worldId,
  factionId,
  defaultValues,
  onSuccess,
}: FactionFormComponentProps) {
  const queryClient = useQueryClient();
  const schemaProvider = new ZodProvider(FactionFormSchema);

  const mutation = useApiMutation<Faction, Partial<Faction>>(
    factionId ? 'PUT' : 'POST',
    factionId
      ? () => `/api/worlds/${worldId}/factions/${factionId}`
      : `/api/worlds/${worldId}/factions`,
    undefined,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${worldId}/factions`],
        });
        onSuccess?.();
      },
    },
  );

  const handleSubmit = (values: Partial<Faction>) => {
    mutation.mutate(values);
  };

  const sanitizedValues = defaultValues
    ? (() => {
        const clone: Partial<Faction> = { ...defaultValues };
        delete clone._id;
        delete clone.worldId;
        delete clone.createdAt;
        delete clone.updatedAt;
        return clone;
      })()
    : undefined;

  return (
    <AutoForm
      schema={schemaProvider}
      onSubmit={handleSubmit}
      values={sanitizedValues}
      withSubmit
    />
  );
}

export default FactionFormComponent;
