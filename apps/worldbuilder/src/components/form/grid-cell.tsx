'use client';
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '../ui/autoform';
import { useApiMutation } from '@/hooks/useApiQuery';
import { GridCell, GridCellFormSchema } from '@talespin/schema';
import { useQueryClient } from '@tanstack/react-query';

interface GridCellFormComponentProps {
  cell: GridCell;
  onSuccess?: () => void;
}

function GridCellFormComponent({
  cell,
  onSuccess,
}: GridCellFormComponentProps) {
  const queryClient = useQueryClient();

  // We only want to edit specific fields
  const schemaProvider = new ZodProvider(
    GridCellFormSchema.pick({
      name: true,
      description: true,
      walkable: true,
      biome: true,
      tags: true,
    }),
  );

  const updateCell = useApiMutation<GridCell, Partial<GridCell>>(
    'PUT',
    `/api/grid-cells/${cell._id}`,
    undefined,
    {
      onSuccess: () => {
        // Invalidate the grid query to refresh the map data
        // We need to know the worldId to invalidate the correct query
        // But since we don't have it passed directly, we might need to invalidate all grids or pass worldId
        // For now, let's assume the parent component handles invalidation or we invalidate broadly
        // Actually, the parent component (LocationsPage) uses `/api/worlds/${id}/grid`
        // We can try to invalidate that if we had the worldId.
        // Let's pass worldId as a prop or just invalidate everything starting with /api/worlds
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.includes('/grid');
          },
        });
        onSuccess?.();
      },
    },
  );

  const handleSubmit = (data: any) => {
    updateCell.mutate(data);
  };

  return (
    <AutoForm
      schema={schemaProvider}
      onSubmit={handleSubmit}
      values={cell}
      withSubmit
    />
  );
}

export default GridCellFormComponent;
