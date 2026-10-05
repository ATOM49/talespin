'use client';

import React, { useState } from 'react';
import { useApiQuery, useApiMutation } from '@/hooks/useApiQuery';
import { World, WorldFormSchema, WorldGridFormSchema } from '@talespin/schema';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { withHeader } from '@/components/withHeader';
import { useQueryClient } from '@tanstack/react-query';
import { ZodProvider } from '@autoform/zod';
import { AutoForm } from '@/components/ui/autoform';
import { Alert, AlertDescription } from '@/components/ui/alert';

function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: worldId } = React.use(params);
  const queryClient = useQueryClient();
  const [isEditingWorld, setIsEditingWorld] = useState(false);
  const [isEditingGrid, setIsEditingGrid] = useState(false);

  const {
    data: world,
    isLoading: worldLoading,
    error: worldError,
  } = useApiQuery<World>(`/api/worlds/${worldId}`);

  const {
    data: gridData,
    isLoading: gridLoading,
    error: gridError,
  } = useApiQuery<{ grid: any; cells: any[] }>(`/api/worlds/${worldId}/grid`);

  const updateWorld = useApiMutation<World, Partial<World>>(
    'PUT',
    `/api/worlds/${worldId}`,
    undefined,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${worldId}`],
        });
        setIsEditingWorld(false);
      },
    },
  );

  const updateGrid = useApiMutation<any, any>(
    'PUT',
    `/api/worlds/${worldId}/grid`,
    undefined,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${worldId}/grid`],
        });
        setIsEditingGrid(false);
      },
    },
  );

  const handleWorldSubmit = (data: any) => {
    updateWorld.mutate(data);
  };

  const handleGridSubmit = (data: any) => {
    updateGrid.mutate(data);
  };

  if (worldLoading || gridLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (worldError || !world) {
    return (
      <div className="container max-w-4xl py-8">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load world data. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const worldSchemaProvider = new ZodProvider(WorldFormSchema);
  const gridSchemaProvider = new ZodProvider(WorldGridFormSchema);

  const sanitizedWorldData = (() => {
    const clone: any = { ...world };
    delete clone._id;
    delete clone.createdAt;
    delete clone.updatedAt;
    return clone;
  })();

  const sanitizedGridData = gridData?.grid
    ? (() => {
        const clone: any = { ...gridData.grid };
        delete clone._id;
        return clone;
      })()
    : undefined;

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      {/* World Settings Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>World Settings</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Update the core settings for this world.
              </p>
            </div>
            {!isEditingWorld && (
              <Button onClick={() => setIsEditingWorld(true)}>Edit</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditingWorld ? (
            <div className="space-y-4">
              <AutoForm
                schema={worldSchemaProvider}
                onSubmit={handleWorldSubmit}
                values={sanitizedWorldData}
              >
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateWorld.isPending}>
                    {updateWorld.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditingWorld(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </AutoForm>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Name</p>
                <p className="text-sm text-muted-foreground">{world.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">{world.theme}</p>
              </div>
              {world.description && (
                <div>
                  <p className="text-sm font-medium">Description</p>
                  <p className="text-sm text-muted-foreground">
                    {world.description}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">Context Window Limit</p>
                <p className="text-sm text-muted-foreground">
                  {world.contextWindowLimit}
                </p>
              </div>
              {world.mapImageUrl && (
                <div>
                  <p className="text-sm font-medium mb-2">Map Image</p>
                  <img
                    src={world.mapImageUrl}
                    alt={world.name}
                    className="w-full max-w-md rounded-lg"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid Configuration Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Grid Configuration</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Configure the grid dimensions and home cell for this world.
              </p>
            </div>
            {!isEditingGrid && gridData?.grid && (
              <Button onClick={() => setIsEditingGrid(true)}>Edit</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {gridError || !gridData?.grid ? (
            <Alert>
              <AlertDescription>
                No grid configuration found for this world.
              </AlertDescription>
            </Alert>
          ) : isEditingGrid ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Warning: Changing grid dimensions will reset all cell data.
                </AlertDescription>
              </Alert>
              <AutoForm
                schema={gridSchemaProvider}
                onSubmit={handleGridSubmit}
                values={sanitizedGridData}
              >
                <div className="flex gap-2">
                  <Button type="submit" disabled={updateGrid.isPending}>
                    {updateGrid.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditingGrid(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </AutoForm>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Width</p>
                  <p className="text-sm text-muted-foreground">
                    {gridData.grid.width} cells
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Height</p>
                  <p className="text-sm text-muted-foreground">
                    {gridData.grid.height} cells
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Home Cell ID</p>
                <p className="text-sm text-muted-foreground font-mono">
                  {gridData.grid.homeCellId}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Total Cells</p>
                <p className="text-sm text-muted-foreground">
                  {gridData.cells?.length ?? 0} cells
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const Page = withHeader(SettingsPage);
export default function WrappedSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Page
      params={params}
      header="World Settings"
      subheader="Manage world configuration and grid settings."
    />
  );
}
