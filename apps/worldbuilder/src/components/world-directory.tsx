'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Compass, Hammer, Sparkles } from 'lucide-react';
import type { World } from '@talespin/schema';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { WorldsGrid } from '@/components/worlds-grid';
import type { WorldDirectoryMode } from '@/components/world-card';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse } from '@/lib/api/types';

export function WorldDirectory({ mode }: { mode: WorldDirectoryMode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const expectedRole = mode === 'build' ? 'BUILDER' : 'EXPLORER';
  const hasAccess =
    status === 'authenticated' && session.user?.role === expectedRole;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/signin?callbackUrl=${encodeURIComponent('/')}`);
      return;
    }

    if (status === 'authenticated' && !hasAccess) {
      router.replace('/');
    }
  }, [hasAccess, router, status]);

  const { data, isLoading, error } = useApiQuery<PaginatedResponse<World>>(
    '/api/worlds',
    undefined,
    { enabled: hasAccess },
  );

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const worlds = data?.data ?? [];
  const Icon = mode === 'build' ? Hammer : Compass;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">
        <div className="space-y-6 p-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                <Icon className="h-4 w-4" />
                {mode === 'build' ? 'Worldbuilder' : 'Explorer'}
              </p>
              <h1 className="mt-2 text-3xl font-bold">
                {mode === 'build' ? 'Manage Worlds' : 'Explore Worlds'}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {mode === 'build'
                  ? 'Create settings and manage the maps, factions, and characters that inhabit them.'
                  : 'Choose a world and begin or resume a story with your character.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push('/')}>
                Switch experience
              </Button>
              {mode === 'build' && (
                <Button onClick={() => router.push('/worlds/new')}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  New World
                </Button>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
              {error.message || 'Unable to load worlds.'}
            </div>
          ) : (
            <WorldsGrid worlds={worlds} mode={mode} isLoading={isLoading} />
          )}
        </div>
      </main>
    </div>
  );
}
