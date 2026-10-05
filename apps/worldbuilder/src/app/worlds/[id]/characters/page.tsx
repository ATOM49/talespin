'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useApiQuery, useApiMutation } from '@/hooks/useApiQuery';
import { Character } from '@talespin/schema';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import CharacterFormComponent from '@/components/form/character';
import { useQueryClient } from '@tanstack/react-query';
import { withHeader } from '@/components/withHeader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const queryClient = useQueryClient();
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletingCharacterId, setDeletingCharacterId] = useState<string | null>(
    null,
  );

  const { data: characters = [], isLoading: charactersLoading } = useApiQuery<
    Character[]
  >(`/api/worlds/${id}/characters`);

  const deleteCharacter = useApiMutation<{ ok: boolean }, string>(
    'DELETE',
    (characterId) => `/api/worlds/${id}/characters/${characterId}`,
    undefined,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [`/api/worlds/${id}/characters`],
        });
      },
    },
  );

  const handleDeleteCharacter = (characterId: string) => {
    if (confirm('Are you sure you want to delete this character?')) {
      setDeletingCharacterId(characterId);
      deleteCharacter.mutate(characterId, {
        onSettled: () => setDeletingCharacterId(null),
      });
    }
  };

  const handleCreateNew = () => {
    setEditingCharacter(null);
    setIsDialogOpen(true);
  };

  const handleEditCharacter = (character: Character) => {
    setEditingCharacter(character);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingCharacter(null);
  };

  if (charactersLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage all characters in this world.
          </p>
        </div>
        <Button onClick={handleCreateNew}>Create Character</Button>
      </div>

      {characters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No characters yet. Create your first NPC to populate treasure
              hunts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {characters.map((character) => {
            const coverImage =
              character.gallery?.[0]?.imageUrl || character.previewUrl;

            return (
              <Link
                key={character._id}
                href={`/worlds/${id}/characters/${character._id}`}
              >
                <Card className="overflow-hidden hover:shadow-md transition">
                  <CardHeader>
                    <CardTitle>{character.name}</CardTitle>
                    {character.description && (
                      <CardDescription className="line-clamp-2">
                        {character.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  {coverImage && (
                    <div className="px-6">
                      <img
                        src={coverImage}
                        alt={character.name}
                        className="w-full rounded-lg aspect-square object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="pt-4">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.preventDefault();
                          handleEditCharacter(character);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteCharacter(character._id);
                        }}
                        disabled={
                          deletingCharacterId === character._id &&
                          deleteCharacter.isPending
                        }
                      >
                        {deletingCharacterId === character._id &&
                        deleteCharacter.isPending
                          ? 'Deleting…'
                          : 'Delete'}
                      </Button>
                    </div>
                    {character.traits && character.traits.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium mb-1">Traits</p>
                        <div className="flex flex-wrap gap-1">
                          {character.traits.slice(0, 3).map((trait, idx) => (
                            <span
                              key={idx}
                              className="rounded-md bg-secondary px-2 py-0.5 text-xs"
                            >
                              {trait}
                            </span>
                          ))}
                          {character.traits.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{character.traits.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          showCloseButton
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {editingCharacter ? 'Edit Character' : 'Create Character'}
            </DialogTitle>
          </DialogHeader>
          <CharacterFormComponent
            worldId={id}
            characterId={editingCharacter?._id}
            defaultValues={editingCharacter ?? undefined}
            onSuccess={handleDialogClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Page = withHeader(CharactersPage);
export default function WrappedCharactersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Page
      params={params}
      header="Characters"
      subheader="Define individual NPCs that populate treasure hunts."
    />
  );
}
