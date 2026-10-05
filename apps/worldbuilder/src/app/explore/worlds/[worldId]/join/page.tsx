'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Character, StoryOverview, World } from '@talespin/schema';
import { ArrowLeft, BookOpen, Plus, Sparkles, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/app-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cn } from '@/lib/utils';

function ExplorerJoinPageContent({ worldId }: { worldId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const worldPath = `/api/worlds/${worldId}`;
  const charactersPath = `/api/explore/worlds/${worldId}/characters`;
  const storyPath = `/api/explore/worlds/${worldId}/story`;

  const worldQuery = useApiQuery<World>(worldPath);
  const charactersQuery = useApiQuery<Character[]>(charactersPath);
  const storyQuery = useApiQuery<StoryOverview | null>(storyPath);

  useEffect(() => {
    if (storyQuery.data) {
      router.replace(`/explore/stories/${storyQuery.data._id}`);
    }
  }, [router, storyQuery.data]);

  const createCharacter = useApiMutation<
    Character,
    { name: string; description?: string }
  >('POST', charactersPath, undefined, {
    onSuccess: (character) => {
      queryClient.setQueryData<Character[]>(
        [charactersPath],
        (current = []) => [character, ...current],
      );
      setSelectedCharacterId(character._id);
      setShowCreateForm(false);
      setName('');
      setDescription('');
    },
  });

  const startStory = useApiMutation<StoryOverview, { characterId: string }>(
    'POST',
    storyPath,
    undefined,
    {
      onSuccess: (story) => {
        queryClient.setQueryData([storyPath], story);
        router.push(`/explore/stories/${story._id}`);
      },
    },
  );

  const handleCreateCharacter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    createCharacter.mutate({
      name: trimmedName,
      description: description.trim() || undefined,
    });
  };

  const isLoading =
    worldQuery.isLoading ||
    charactersQuery.isLoading ||
    storyQuery.isLoading ||
    Boolean(storyQuery.data);
  const error = worldQuery.error || charactersQuery.error || storyQuery.error;

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center gap-3 text-muted-foreground">
        <Spinner />
        <span>
          {storyQuery.data ? 'Resuming your story...' : 'Opening world...'}
        </span>
      </div>
    );
  }

  if (error || !worldQuery.data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Unable to open this world</AlertTitle>
          <AlertDescription>
            {error?.message || 'The world could not be found.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const world = worldQuery.data;
  const characters = charactersQuery.data ?? [];

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-muted/40 to-background">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <Button variant="ghost" onClick={() => router.push('/explore')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Worlds
        </Button>

        <section className="grid gap-6 overflow-hidden rounded-3xl border bg-card shadow-sm md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
          <div className="space-y-4 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
              Begin a story
            </p>
            <h1 className="text-4xl font-bold tracking-tight">{world.name}</h1>
            <p className="max-w-2xl text-muted-foreground">
              {world.description ||
                'A living world is waiting for the character who will shape its next chapter.'}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              Choose who you will play. The character remains part of this
              world; your story records your own journey.
            </div>
          </div>
          <div className="relative min-h-64 bg-muted">
            {world.mapImageUrl ? (
              <Image
                src={world.mapImageUrl}
                alt={`${world.name} map`}
                fill
                sizes="(min-width: 768px) 40vw, 100vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center bg-gradient-to-br from-primary/10 to-muted text-sm text-muted-foreground">
                Map preview coming soon
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Choose your character</h2>
              <p className="text-sm text-muted-foreground">
                Play a world character or bring your own explorer into the
                story.
              </p>
            </div>
            <Button
              variant={showCreateForm ? 'secondary' : 'outline'}
              onClick={() => setShowCreateForm((open) => !open)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {showCreateForm ? 'Choose existing' : 'Create your own'}
            </Button>
          </div>

          {showCreateForm ? (
            <Card className="mx-auto max-w-2xl">
              <CardHeader>
                <CardTitle>Create your explorer</CardTitle>
                <CardDescription>
                  Start with the essentials. You can develop their history as
                  the story unfolds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleCreateCharacter}>
                  <div className="space-y-2">
                    <Label htmlFor="character-name">Name</Label>
                    <Input
                      id="character-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={80}
                      required
                      placeholder="How are they known?"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="character-description">
                      A short character hook
                    </Label>
                    <Textarea
                      id="character-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={500}
                      placeholder="A wandering cartographer who never forgets a road..."
                    />
                  </div>
                  {createCharacter.error && (
                    <Alert variant="destructive">
                      <AlertTitle>Character creation failed</AlertTitle>
                      <AlertDescription>
                        {createCharacter.error.message}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" disabled={createCharacter.isLoading}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {createCharacter.isLoading
                      ? 'Creating character...'
                      : 'Create and select character'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : characters.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {characters.map((character) => {
                const selected = selectedCharacterId === character._id;
                return (
                  <button
                    key={character._id}
                    type="button"
                    onClick={() => setSelectedCharacterId(character._id)}
                    aria-pressed={selected}
                    className="text-left"
                  >
                    <Card
                      className={cn(
                        'h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md',
                        selected && 'border-primary ring-2 ring-primary/30',
                      )}
                    >
                      <div className="relative h-48 bg-muted">
                        {character.previewUrl ? (
                          <Image
                            src={character.previewUrl}
                            alt={character.name}
                            fill
                            sizes="(min-width: 1024px) 30vw, 50vw"
                            className="object-cover object-top"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <UserRound className="h-12 w-12 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle>{character.name}</CardTitle>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {character.userId
                              ? 'Your character'
                              : 'World character'}
                          </span>
                        </div>
                        <CardDescription className="line-clamp-3">
                          {character.description ||
                            'Their part in this world is waiting to be discovered.'}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </button>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <UserRound className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">No playable characters yet</p>
                  <p className="text-sm text-muted-foreground">
                    Create the first explorer for this world.
                  </p>
                </div>
                <Button onClick={() => setShowCreateForm(true)}>
                  Create your character
                </Button>
              </CardContent>
            </Card>
          )}

          {!showCreateForm && characters.length > 0 && (
            <div className="sticky bottom-4 flex flex-col items-center gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedCharacterId
                  ? 'Your character is ready to enter the story.'
                  : 'Select a character to continue.'}
              </p>
              <Button
                size="lg"
                disabled={!selectedCharacterId || startStory.isLoading}
                onClick={() =>
                  selectedCharacterId &&
                  startStory.mutate({ characterId: selectedCharacterId })
                }
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {startStory.isLoading ? 'Starting story...' : 'Start story'}
              </Button>
            </div>
          )}

          {startStory.error && (
            <Alert variant="destructive">
              <AlertTitle>Unable to start story</AlertTitle>
              <AlertDescription>{startStory.error.message}</AlertDescription>
            </Alert>
          )}
        </section>
      </div>
    </main>
  );
}

export default function ExplorerJoinPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const { worldId } = React.use(params);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <ExplorerJoinPageContent worldId={worldId} />
    </div>
  );
}
