'use client';

import React, { useState } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Character } from '@talespin/schema';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CharacterFormComponent from '@/components/form/character';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  worldId: string;
  characterId?: string;
}

export default function CharacterDetails({ worldId, characterId }: Props) {
  const fetchPath = characterId
    ? `/api/worlds/${worldId}/characters/${characterId}`
    : `/api/worlds/${worldId}/player-character`;

  const {
    data: character,
    isLoading,
    error,
  } = useApiQuery<Character | null>(fetchPath);
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (error) {
    return (
      <Alert>
        <AlertTitle>Unable to load character</AlertTitle>
        <AlertDescription>
          {error.message || 'Please refresh and try again.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="container max-w-4xl py-8">
        <CharacterFormComponent
          worldId={worldId}
          onSuccess={() =>
            queryClient.invalidateQueries({
              queryKey: [`/api/worlds/${worldId}/player-character`],
            })
          }
        />
      </div>
    );
  }

  const galleryImages =
    character.gallery && character.gallery.length > 0
      ? character.gallery
      : character.previewUrl
        ? [
            {
              angle: 'Primary portrait',
              description: 'Auto-generated portrait',
              imageUrl: character.previewUrl,
            },
          ]
        : [];

  const prev = () =>
    setSelectedIndex((i) => (i <= 0 ? galleryImages.length - 1 : i - 1));
  const next = () =>
    setSelectedIndex((i) => (i >= galleryImages.length - 1 ? 0 : i + 1));

  return (
    <div className="h-full w-full">
      <div className="flex h-full gap-4">
        <div className="w-64 overflow-auto rounded-xl border border-border/60 bg-card/40 p-2">
          <h2 className="mb-2 px-2 text-sm font-semibold">Concept Art</h2>
          <div className="space-y-2">
            {galleryImages.map((img, idx) => (
              <button
                key={`${img.imageUrl}-${idx}`}
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  'flex items-start gap-2 rounded-md p-2 w-full text-left',
                  selectedIndex === idx && 'ring-2 ring-primary/30 bg-muted/40',
                )}
              >
                <div className="h-24 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                  <img
                    src={img.imageUrl}
                    alt={`${character.name} ${img.angle}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{img.angle}</div>
                  {img.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {img.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {galleryImages.length === 0 && (
              <div className="px-2 text-sm text-muted-foreground">
                No concept art available yet.
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-border/60 bg-muted/10 p-4 flex items-center justify-center relative">
          {galleryImages.length > 0 ? (
            <>
              <figure className="flex h-full w-full items-center justify-center">
                <img
                  src={galleryImages[selectedIndex].imageUrl}
                  alt={`${character.name} ${galleryImages[selectedIndex].angle}`}
                  className="h-full w-full object-contain rounded-lg"
                />
                <figcaption className="absolute bottom-6 left-6 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                  {galleryImages[selectedIndex].angle}
                </figcaption>
              </figure>
              {galleryImages.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-2 shadow"
                  >
                    ‹
                  </button>
                  <button
                    onClick={next}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-2 shadow"
                  >
                    ›
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-sm text-muted-foreground">
              No concept art available yet.
            </div>
          )}
        </div>

        <div className="w-80">
          <div className="space-y-4 p-2">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">{character.name}</h1>
                {character.description && (
                  <p className="text-sm text-muted-foreground">
                    {character.description}
                  </p>
                )}
              </div>
              <div>
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </div>
            </div>

            {character.biography && (
              <Card>
                <CardHeader>
                  <CardTitle>Biography</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {character.biography}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Drawer open={isEditing} onOpenChange={setIsEditing} direction="right">
        <DrawerContent className="w-full max-w-md border-l border-sidebar-border">
          <CharacterFormComponent
            worldId={worldId}
            characterId={character._id}
            defaultValues={character ?? undefined}
            onSuccess={() => {
              queryClient.invalidateQueries({
                queryKey: [`/api/worlds/${worldId}/characters`],
              });
              setIsEditing(false);
            }}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
