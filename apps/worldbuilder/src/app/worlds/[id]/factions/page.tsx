'use client';
import React, { useState } from 'react';
import { EntityLayout } from '@/components/entity-layout';
import { useApiQuery, useApiMutation } from '@/hooks/useApiQuery';
import { Faction } from '@talespin/schema';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import FactionFormComponent from '@/components/form/faction';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function FactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const queryClient = useQueryClient();
  const [activeFaction, setActiveFaction] = useState<Faction | null>(null);
  const [deletingFactionId, setDeletingFactionId] = useState<string | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: factions = [], isLoading: factionsLoading } = useApiQuery<
    Faction[]
  >(`/api/worlds/${id}/factions`);

  const deleteFaction = useApiMutation<{ ok: boolean }, string>(
    'DELETE',
    (factionId) => `/api/worlds/${id}/factions/${factionId}`,
    undefined,
    {
      onSuccess: (_data, factionId) => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${id}/factions`],
        });
        if (activeFaction?._id === factionId) {
          setActiveFaction(null);
        }
      },
    },
  );

  const handleDeleteFaction = (factionId: string) => {
    setDeletingFactionId(factionId);
    deleteFaction.mutate(factionId, {
      onSettled: () => setDeletingFactionId(null),
    });
  };

  const handleFactionCreated = () => {
    setIsDialogOpen(false);
  };

  const renderFactionsList = () => (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {factionsLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : factions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No factions yet. Start by defining a culture, species, or archetype.
          </p>
        ) : (
          factions.map((faction) => (
            <Card
              key={faction._id}
              className={
                activeFaction?._id === faction._id
                  ? 'border-primary cursor-pointer'
                  : 'cursor-pointer'
              }
              onClick={() => setActiveFaction(faction)}
            >
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <CardTitle className="text-base">{faction.name}</CardTitle>
                    <p className="text-xs uppercase text-muted-foreground">
                      {faction.category}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {faction.summary ||
                        faction.description ||
                        'No description yet.'}
                    </p>
                  </div>
                  <div
                    className="flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFaction(faction._id)}
                      disabled={
                        deletingFactionId === faction._id &&
                        deleteFaction.isPending
                      }
                    >
                      {deletingFactionId === faction._id &&
                      deleteFaction.isPending
                        ? 'Deleting…'
                        : 'Delete'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const renderFactionPreview = () => {
    if (!activeFaction) {
      return (
        <div className="flex h-full items-center justify-center text-center p-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Select a faction to view details.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
        <div>
          <h2 className="text-2xl font-bold">{activeFaction.name}</h2>
          <p className="text-sm uppercase text-muted-foreground mt-1">
            {activeFaction.category}
          </p>
        </div>

        {activeFaction.previewUrl && (
          <div className="rounded-lg overflow-hidden border">
            <img
              src={activeFaction.previewUrl}
              alt={activeFaction.name}
              className="w-full h-auto"
            />
          </div>
        )}

        {activeFaction.summary && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Summary</h3>
            <p className="text-sm text-muted-foreground">
              {activeFaction.summary}
            </p>
          </div>
        )}

        {activeFaction.description && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Description</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {activeFaction.description}
            </p>
          </div>
        )}

        {activeFaction.meta?.tone && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Tone</h3>
            <p className="text-sm text-muted-foreground">
              {activeFaction.meta.tone}
            </p>
          </div>
        )}

        {activeFaction.meta?.keywords &&
          activeFaction.meta.keywords.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {activeFaction.meta.keywords.map((keyword, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

        {activeFaction.meta?.characterHooks &&
          activeFaction.meta.characterHooks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Character Hooks</h3>
              <div className="space-y-2">
                {activeFaction.meta.characterHooks.map((hook, idx) => (
                  <div key={idx} className="border-l-2 border-primary pl-3">
                    <p className="text-sm font-medium">{hook.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {hook.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    );
  };

  return (
    <EntityLayout
      header={
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Factions & Cultures</h1>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">New Faction</Button>
            </DialogTrigger>
            <DialogContent showCloseButton>
              <DialogHeader>
                <DialogTitle>Create New Faction</DialogTitle>
              </DialogHeader>
              <FactionFormComponent
                worldId={id}
                onSuccess={handleFactionCreated}
              />
            </DialogContent>
          </Dialog>
        </div>
      }
      subheader="Manage reusable groups that define the political and cultural landscape."
      left={renderFactionsList()}
    >
      {renderFactionPreview()}
    </EntityLayout>
  );
}
