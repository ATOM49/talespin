'use client';
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '../ui/autoform';
import { useApiMutation } from '@/hooks/useApiQuery';
import { World, WorldFormSchema } from '@talespin/schema';
import { useQueryClient } from '@tanstack/react-query';

interface WorldFormComponentProps {
  onSuccess?: () => void;
}

function WorldFormComponent({ onSuccess }: WorldFormComponentProps) {
  const queryClient = useQueryClient();
  const schemaProvider = new ZodProvider(WorldFormSchema);

  const createWorld = useApiMutation<World, Partial<World>>(
    'POST',
    '/api/worlds',
    undefined,
    {
      onSuccess: (newWorld) => {
        queryClient.invalidateQueries({ queryKey: ['/api/worlds'] });
        onSuccess?.();
      },
    },
  );
  const handleSubmit = (data: any) => {
    createWorld.mutate(data);
  };

  return (
    <AutoForm schema={schemaProvider} onSubmit={handleSubmit} withSubmit />
  );
}

export default WorldFormComponent;
