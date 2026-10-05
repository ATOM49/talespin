'use client';

import { BookOpen, Flag, MountainSnow, Sparkles, Wind } from 'lucide-react';
import type { Faction, Region } from '@talespin/schema';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const INFLUENCE_STYLES: Record<
  Region['factionPresence'][number]['influence'],
  string
> = {
  dominant:
    'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  established: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  contested:
    'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200',
  hidden:
    'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200',
};

type MapRegionDetailsProps = {
  region: Region;
  factionById: Map<string, Faction>;
};

export function MapRegionDetails({
  region,
  factionById,
}: MapRegionDetailsProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-6 p-5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
            <MountainSnow className="size-3.5 text-primary" aria-hidden />
            {region.biome}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
            <Wind className="size-3.5 text-primary" aria-hidden />
            {region.atmosphere}
          </span>
          <span className="inline-flex items-center rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {region.cellIds.length}{' '}
            {region.cellIds.length === 1 ? 'map cell' : 'map cells'}
          </span>
        </div>

        <section aria-labelledby={`region-${region._id}-overview`}>
          <h3
            id={`region-${region._id}-overview`}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
          >
            Region overview
          </h3>
          <p className="mt-3 text-sm leading-7 text-foreground/85">
            {region.description}
          </p>
        </section>

        <section aria-labelledby={`region-${region._id}-factions`}>
          <div className="flex items-center gap-2">
            <Flag className="size-4 text-primary" aria-hidden />
            <h3
              id={`region-${region._id}-factions`}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
            >
              Faction presence
            </h3>
          </div>
          {region.factionPresence.length > 0 ? (
            <div className="mt-3 space-y-3">
              {region.factionPresence.map((presence) => {
                const faction = factionById.get(presence.factionId);

                return (
                  <div
                    key={`${region._id}-${presence.factionId}`}
                    className="rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {faction?.name ?? 'Faction unavailable'}
                      </p>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]',
                          INFLUENCE_STYLES[presence.influence],
                        )}
                      >
                        {presence.influence}
                      </span>
                    </div>
                    {faction?.summary ? (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {faction.summary}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed">
                      {presence.rationale}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              No faction currently has a recorded presence here.
            </p>
          )}
        </section>

        <section aria-labelledby={`region-${region._id}-hooks`}>
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" aria-hidden />
            <h3
              id={`region-${region._id}-hooks`}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
            >
              Mission hooks
            </h3>
          </div>
          <ul className="mt-3 space-y-2">
            {region.missionHooks.map((hook, index) => (
              <li
                key={`${region._id}-hook-${index}`}
                className="flex gap-2 text-sm leading-relaxed text-foreground/85"
              >
                <Sparkles
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{hook}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ScrollArea>
  );
}
