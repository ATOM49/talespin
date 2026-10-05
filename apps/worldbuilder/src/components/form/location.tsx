'use client';
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '../ui/autoform';
import { useApiMutation } from '@/hooks/useApiQuery';
import { Location, LocationFormSchema } from '@talespin/schema';
import { useQueryClient } from '@tanstack/react-query';

interface LocationFormComponentProps {
  worldId: string;
  defaultValues?: Partial<Location>;
  onSuccess?: () => void;
}

function LocationFormComponent({
  worldId,
  defaultValues,
  onSuccess,
}: LocationFormComponentProps) {
  const queryClient = useQueryClient();
  const schemaProvider = new ZodProvider(LocationFormSchema);

  const createLocation = useApiMutation<Location, Partial<Location>>(
    'POST',
    `/api/worlds/${worldId}/locations`,
    undefined,
    {
      onSuccess: (newLocation) => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${worldId}/locations`],
        });
        onSuccess?.();
      },
    },
  );

  const handleSubmit = (data: any) => {
    createLocation.mutate(data);
  };

  return (
    <AutoForm
      schema={schemaProvider}
      onSubmit={handleSubmit}
      values={defaultValues}
      withSubmit
    />
  );
}

export default LocationFormComponent;
