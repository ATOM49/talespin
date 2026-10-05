'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/useApiQuery';
import { Character, World } from '@talespin/schema';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CharacterFormComponent from '@/components/form/character';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CharacterGallery } from '@/components/character-gallery';
import CharacterDetails from '@/components/character-details';

function CharacterPageContent({ worldId }: { worldId: string }) {
  const {
    data: world,
    isLoading: worldLoading,
    error: worldError,
  } = useApiQuery<World>(`/api/worlds/${worldId}`);

  const {
    data: playerCharacter,
    isLoading: characterLoading,
    error: characterError,
  } = useApiQuery<Character | null>(`/api/worlds/${worldId}/player-character`);

  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const saveCharacter = useApiMutation<Character, Partial<Character>>(
    'PUT',
    `/api/worlds/${worldId}/player-character`,
    undefined,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${worldId}/player-character`],
        });
        setIsEditing(false);
      },
    },
  );

  if (worldError || characterError) {
    return (
      <Alert className="max-w-2xl">
        <AlertTitle>Unable to load world</AlertTitle>
        <AlertDescription>
          {(worldError || characterError)?.message ||
            'Please refresh the page and try again.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (worldLoading || characterLoading || !world) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const hasCharacter = Boolean(playerCharacter?._id);

  if (!hasCharacter) {
    // If there's no character, show the form directly
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

  return <CharacterDetails worldId={worldId} />;
}

export default function WrappedCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  return <CharacterPageContent worldId={id} />;
}
