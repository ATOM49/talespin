'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { StoryPlayView } from '@talespin/schema';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Compass,
  RotateCcw,
  UserRound,
} from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';

function StoryPageContent({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();
  const storyPath = `/api/explore/stories/${storyId}`;
  const storyQuery = useApiQuery<StoryPlayView>(storyPath, undefined, {
    refetchInterval: 1500,
  });
  const retry = useApiMutation(
    'POST',
    (jobId: string) => `/api/explore/stories/${storyId}/jobs/${jobId}/retry`,
    undefined,
    {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [storyPath] }),
    },
  );

  if (storyQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center gap-3 text-muted-foreground">
        <Spinner />
        <span>Opening your story...</span>
      </div>
    );
  }

  const story = storyQuery.data;
  if (storyQuery.error || !story) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Unable to open story</AlertTitle>
          <AlertDescription>
            {storyQuery.error?.message || 'This story could not be found.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const character = story.participants[0].character;
  const preparing = ['QUEUED', 'GENERATING'].includes(story.setupStatus);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <Button variant="ghost" asChild>
          <Link href="/explore">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Worlds
          </Link>
        </Button>

        <section className="overflow-hidden rounded-3xl border bg-card shadow-lg">
          <div className="relative min-h-[24rem]">
            {story.world.mapImageUrl ? (
              <Image
                src={story.world.mapImageUrl}
                alt={`${story.world.name} map`}
                fill
                sizes="100vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-muted to-background" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 space-y-3 p-8 text-white md:p-12">
              <p className="text-sm uppercase tracking-[0.3em] text-white/70">
                {story.world.name}
              </p>
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
                {story.title}
              </h1>
              <p className="max-w-3xl text-white/80">
                {story.premise ??
                  'The world is gathering its paths, encounters, and first mystery.'}
              </p>
            </div>
          </div>
        </section>

        {story.generationError && (
          <Alert variant="destructive">
            <AlertTitle>Story preparation paused</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{story.generationError}</p>
              {story.failedJobId && (
                <Button
                  variant="outline"
                  onClick={() => retry.mutate(story.failedJobId!)}
                  disabled={retry.isLoading}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Retry preparation
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <Card className="overflow-hidden">
            <div className="relative h-56 bg-muted">
              {character.previewUrl ? (
                <Image
                  src={character.previewUrl}
                  alt={character.name}
                  fill
                  sizes="(min-width: 768px) 35vw, 100vw"
                  className="object-cover object-top"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <UserRound className="h-16 w-16 text-muted-foreground/50" />
                </div>
              )}
            </div>
            <CardHeader>
              <CardTitle>{character.name}</CardTitle>
              <CardDescription>{character.description}</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Three chapters
              </CardTitle>
              <CardDescription>
                Each completed mission carries its facts and consequences
                forward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {story.chapters.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-muted-foreground">
                  <Spinner />
                  <span>The game master is preparing the story arc...</span>
                </div>
              ) : (
                story.chapters.map((chapter) => (
                  <div
                    key={chapter._id}
                    className="flex gap-3 rounded-xl border p-4"
                  >
                    {chapter.status === 'COMPLETED' ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                    ) : (
                      <Circle
                        className={
                          chapter.status === 'ACTIVE'
                            ? 'mt-0.5 h-5 w-5 fill-primary/20 text-primary'
                            : 'mt-0.5 h-5 w-5 text-muted-foreground'
                        }
                      />
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Chapter {chapter.order} · {chapter.status}
                      </p>
                      <p className="font-semibold">{chapter.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {chapter.summary}
                      </p>
                    </div>
                  </div>
                ))
              )}

              <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <Compass className="h-5 w-5 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {preparing
                      ? 'Preparing the next mission and its route...'
                      : story.status === 'COMPLETED'
                        ? 'This story has reached its conclusion.'
                        : 'Your active mission is ready.'}
                  </p>
                </div>
                {story.activeMissionId && (
                  <Button asChild>
                    <Link
                      href={`/explore/stories/${storyId}/missions/${story.activeMissionId}`}
                    >
                      Enter mission
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function StoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = React.use(params);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <StoryPageContent storyId={storyId} />
    </div>
  );
}
