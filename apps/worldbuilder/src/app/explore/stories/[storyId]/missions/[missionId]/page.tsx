'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type {
  GridCell,
  MissionPlayView,
  SubmitMissionAction,
} from '@talespin/schema';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Compass,
  Eye,
  EyeOff,
  Footprints,
  History,
  MapPin,
  MessageCircle,
  Pause,
  RotateCcw,
  ShipWheel,
  Sparkles,
  Target,
} from 'lucide-react';
import type { GridCellVisual } from '@/components/FabricGrid/types';
import { AppHeader } from '@/components/app-header';
import { MapViewer } from '@/components/map-viewer';
import { MissionTravelCost } from '@/components/mission-travel-cost';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';

const AUTO_TRAVEL_STEP_DELAY_MS = 700;

const SPOILER_WARNINGS = [
  {
    title: 'The map was quiet for a reason.',
    description:
      'Some destinations mean more when the road makes you earn them.',
    continueLabel: 'Let the trail unfold',
    revealLabel: 'Steal the answer',
  },
  {
    title: 'A shortcut can cost more than footsteps.',
    description:
      'Once the destination is named, no fog can put the mystery back.',
    continueLabel: 'Keep the mystery',
    revealLabel: 'Pay the price',
  },
  {
    title: 'The answer was waiting at the end of the road.',
    description:
      'Dragging it into the light now would leave the journey one secret poorer.',
    continueLabel: 'I will find it myself',
    revealLabel: 'Show me anyway',
  },
] as const;

function MissionPageContent({
  storyId,
  missionId,
}: {
  storyId: string;
  missionId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const missionDetailsTriggerRef = useRef<HTMLButtonElement>(null);
  const [freeText, setFreeText] = useState('');
  const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
  const [showDestinationSpoiler, setShowDestinationSpoiler] = useState(false);
  const [spoilerConfirmationOpen, setSpoilerConfirmationOpen] = useState(false);
  const [spoilerWarningIndex, setSpoilerWarningIndex] = useState(-1);
  const [autoTravel, setAutoTravel] = useState(false);
  const missionPath = `/api/explore/stories/${storyId}/missions/${missionId}`;
  const actionPath = `${missionPath}/actions`;
  const missionQuery = useApiQuery<MissionPlayView>(missionPath, undefined, {
    refetchInterval: 1500,
  });
  const action = useApiMutation<MissionPlayView, SubmitMissionAction>(
    'POST',
    actionPath,
    undefined,
    {
      onSuccess: (view) => {
        queryClient.setQueryData([missionPath], view);
        if (view.mission._id !== missionId) {
          router.replace(
            `/explore/stories/${storyId}/missions/${view.mission._id}`,
          );
        } else {
          void missionQuery.refetch();
        }
        if (view.currentInteraction?.status !== 'READY') setFreeText('');
      },
      onError: () => setAutoTravel(false),
    },
  );
  const mutateAction = action.mutate;
  const retryGeneration = useApiMutation(
    'POST',
    (jobId: string) => `/api/explore/stories/${storyId}/jobs/${jobId}/retry`,
    undefined,
    { onSuccess: () => void missionQuery.refetch() },
  );
  const view = missionQuery.data;
  const autoTravelVersion =
    autoTravel &&
    view?.mission._id === missionId &&
    view.mission.status === 'ACTIVE' &&
    view.mission.travelPlan &&
    !view.currentInteraction &&
    !view.generationPending &&
    !action.isLoading
      ? view.mission.version
      : null;

  useEffect(() => {
    if (autoTravelVersion === null) return;
    const timeoutId = window.setTimeout(() => {
      mutateAction({
        actionId: crypto.randomUUID(),
        expectedVersion: autoTravelVersion,
        action: { type: 'CONTINUE_TRAVEL' },
      });
    }, AUTO_TRAVEL_STEP_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [autoTravelVersion, mutateAction]);

  const cellVisuals = useMemo<Record<number, GridCellVisual>>(() => {
    if (!view) return {};
    const width = view.grid.grid.width;
    const path = new Set(view.mission.travelPlan?.pathCellIds ?? []);
    return view.grid.cells.reduce<Record<number, GridCellVisual>>(
      (result, cell) => {
        if (path.has(cell._id)) {
          result[cell.y * width + cell.x] = {
            fill: 'rgba(59, 130, 246, 0.2)',
            hoverFill: 'rgba(59, 130, 246, 0.35)',
            selectedFill: 'rgba(59, 130, 246, 0.42)',
          };
        }
        if (
          showDestinationSpoiler &&
          cell._id === view.mission.destinationCellId
        ) {
          result[cell.y * width + cell.x] = {
            fill: 'rgba(245, 158, 11, 0.24)',
            hoverFill: 'rgba(245, 158, 11, 0.4)',
            selectedFill: 'rgba(245, 158, 11, 0.48)',
          };
        }
        return result;
      },
      {},
    );
  }, [showDestinationSpoiler, view]);

  if (missionQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center gap-3 text-muted-foreground">
        <Spinner /> Opening mission...
      </div>
    );
  }
  if (missionQuery.error || !view) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Unable to open mission</AlertTitle>
          <AlertDescription>
            {missionQuery.error?.message ?? 'Mission not found.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const send = (playerAction: SubmitMissionAction['action']) =>
    action.mutate({
      actionId: crypto.randomUUID(),
      expectedVersion: view.mission.version,
      action: playerAction,
    });
  const interaction = view.currentInteraction;
  const disabled = action.isLoading || view.generationPending;
  const currentCell = view.grid.cells.find(
    (cell) => cell._id === view.mission.currentCellId,
  );
  const resolvedInteractions = view.interactions.filter(
    (item) => item.status === 'RESOLVED',
  );

  const selectDestination = (cell: GridCell) => {
    if (disabled || interaction || view.mission.status !== 'ACTIVE') return;
    setAutoTravel(false);
    send({ type: 'SET_DESTINATION', destinationCellId: cell._id });
  };

  const requestDestinationSpoiler = () => {
    setMissionDetailsOpen(false);
    setSpoilerWarningIndex(
      (currentIndex) => (currentIndex + 1) % SPOILER_WARNINGS.length,
    );
    setSpoilerConfirmationOpen(true);
  };

  const closeSpoilerConfirmation = () => {
    setSpoilerConfirmationOpen(false);
    window.requestAnimationFrame(() =>
      missionDetailsTriggerRef.current?.focus(),
    );
  };

  const spoilerWarning =
    SPOILER_WARNINGS[Math.max(spoilerWarningIndex, 0)] ?? SPOILER_WARNINGS[0];

  const autoJourneyActive =
    autoTravel &&
    view.mission.status === 'ACTIVE' &&
    Boolean(view.mission.travelPlan);
  const autoJourneyStatus = interaction
    ? 'Waiting at this encounter. The journey resumes after you resolve it.'
    : view.generationPending
      ? 'Waiting while the next story moment is prepared.'
      : action.isLoading
        ? 'Advancing one saved travel step...'
        : 'Moving toward the next meaningful stop.';

  const interactionDialog = interaction ? (
    <Card
      role="dialog"
      aria-modal="false"
      aria-labelledby="active-interaction-title"
      className="gap-4 border-primary/30 bg-background/95 py-4 backdrop-blur"
    >
      <CardHeader className="px-4">
        <CardTitle
          id="active-interaction-title"
          className="flex items-center gap-2 text-lg"
        >
          {interaction.kind === 'TRANSPORT' ? (
            <ShipWheel className="h-5 w-5" />
          ) : (
            <MessageCircle className="h-5 w-5" />
          )}
          Interaction
        </CardTitle>
        <CardDescription>{interaction.situation}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {interaction.outcome?.accepted === false ? (
          <Alert>
            <AlertTitle>Try another approach</AlertTitle>
            <AlertDescription>{interaction.outcome.narrative}</AlertDescription>
          </Alert>
        ) : null}
        {interaction.kind === 'TRANSPORT' ? (
          <div className="space-y-2">
            {interaction.transportOptions.map((option) => (
              <Button
                key={option.id}
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                disabled={disabled}
                onClick={() =>
                  send({
                    type: 'CHOOSE_TRANSPORT',
                    optionId: option.id,
                  })
                }
              >
                <ShipWheel className="mr-3 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">{option.name}</span>
                  <span className="block whitespace-normal text-xs text-muted-foreground">
                    {option.description} · cost {option.actionCost} per cell
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : interaction.status === 'RESOLVING' ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner /> Resolving your choice...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {interaction.choices.map((choice) => (
                <Button
                  key={choice.id}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                  disabled={disabled}
                  onClick={() =>
                    send({
                      type: 'CHOOSE_INTERACTION',
                      choiceId: choice.id,
                    })
                  }
                >
                  <Sparkles className="mr-3 h-4 w-4 shrink-0" />
                  {choice.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2 border-t pt-4">
              <Textarea
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                placeholder="Or describe what you do..."
                maxLength={800}
              />
              <Button
                disabled={disabled || !freeText.trim()}
                onClick={() =>
                  send({ type: 'FREE_TEXT', text: freeText.trim() })
                }
              >
                Submit action
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  ) : null;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20">
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href={`/explore/stories/${storyId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Story
            </Link>
          </Button>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-semibold uppercase tracking-widest text-primary">
                {view.world.name}
              </p>
              <h1 className="truncate text-2xl font-bold">
                {view.story.title}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                <span>Chapter {view.chapter.order} of 3</span>
                <span aria-hidden="true"> · </span>
                <span>{view.mission.title}</span>
              </p>
            </div>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4" />
                  Journey history
                  {resolvedInteractions.length > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                      {resolvedInteractions.length}
                    </span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader className="border-b pr-12">
                  <SheetTitle className="flex items-center gap-2">
                    <History className="h-4 w-4" /> Journey history
                  </SheetTitle>
                  <SheetDescription>
                    Resolved events from {view.mission.title}, newest first.
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                  {resolvedInteractions.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Your choices and their consequences will appear here as
                      the journey unfolds.
                    </div>
                  ) : (
                    <ol className="space-y-4">
                      {resolvedInteractions
                        .slice()
                        .reverse()
                        .map((item) => (
                          <li
                            key={item._id}
                            className="border-l-2 border-primary/30 pl-4"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                              {item.kind}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                              {item.outcome?.narrative ?? item.situation}
                            </p>
                          </li>
                        ))}
                    </ol>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {(action.error || view.generationError) && (
          <Alert variant="destructive">
            <AlertTitle>The journey paused</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{action.error?.message ?? view.generationError}</p>
              {view.failedJobId && (
                <Button
                  variant="outline"
                  disabled={retryGeneration.isLoading}
                  onClick={() => retryGeneration.mutate(view.failedJobId!)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry generation
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid min-h-[70vh] gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden">
            <CardHeader className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardDescription className="flex items-start gap-2">
                    <Compass className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Select any cell to plan a route. Terrain changes determine
                      how you cross it.
                    </span>
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Popover
                    open={missionDetailsOpen}
                    onOpenChange={setMissionDetailsOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        ref={missionDetailsTriggerRef}
                        variant="outline"
                        size="sm"
                      >
                        <Target className="h-4 w-4" /> Mission details
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      sideOffset={8}
                      aria-label="Mission details"
                      onCloseAutoFocus={(event) => {
                        if (spoilerConfirmationOpen) event.preventDefault();
                      }}
                      className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-2rem))] space-y-4 overflow-y-auto"
                    >
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                          Mission brief
                        </p>
                        <h2 className="font-semibold leading-tight">
                          {view.mission.title}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {view.mission.summary}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium">Objectives</p>
                        {view.mission.objectives.map((objective) => (
                          <div
                            key={objective.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            {objective.complete ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span
                              className={
                                objective.complete
                                  ? 'text-muted-foreground'
                                  : ''
                              }
                            >
                              {objective.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                        <span>
                          Current:{' '}
                          {currentCell?.name ??
                            currentCell?.biome ??
                            'Unknown cell'}
                        </span>
                      </div>

                      {view.mission.travelPlan && (
                        <div className="space-y-2 rounded-lg border p-3 text-sm">
                          <p className="font-medium">Upcoming route</p>
                          {view.mission.travelPlan.stops
                            .filter(
                              (stop) =>
                                stop.routeIndex >
                                view.mission.travelPlan!.currentIndex,
                            )
                            .slice(0, 4)
                            .map((stop) => (
                              <div
                                key={`${stop.kind}-${stop.routeIndex}`}
                                className="flex justify-between gap-4 text-muted-foreground"
                              >
                                <span>
                                  {stop.kind === 'TRANSPORT'
                                    ? 'Terrain crossing'
                                    : 'Destination'}
                                </span>
                                <span className="text-right">
                                  {stop.routeIndex} cells along route
                                </span>
                              </div>
                            ))}
                        </div>
                      )}

                      <div className="space-y-2 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Shortcut
                        </p>
                        <Button
                          aria-pressed={showDestinationSpoiler}
                          className={
                            showDestinationSpoiler
                              ? 'w-full border-amber-500 bg-amber-300 text-amber-950 hover:bg-amber-200'
                              : 'w-full'
                          }
                          onClick={() => {
                            if (showDestinationSpoiler) {
                              setShowDestinationSpoiler(false);
                            } else {
                              requestDestinationSpoiler();
                            }
                          }}
                          size="sm"
                          variant={
                            showDestinationSpoiler ? 'outline' : 'secondary'
                          }
                        >
                          {showDestinationSpoiler ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          {showDestinationSpoiler
                            ? 'Hide destination'
                            : 'Reveal destination'}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Marks the destination without uncovering the map cell.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <MissionTravelCost
                    used={view.mission.actionsUsed}
                    maximum={view.mission.maxActions}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[66vh] min-h-[500px]">
                <MapViewer
                  imageUrl={view.world.mapImageUrl ?? ''}
                  grid={view.grid}
                  activeCellId={view.mission.currentCellId}
                  selectedCellIds={view.mission.travelPlan?.pathCellIds}
                  onCellClick={selectDestination}
                  showGrid
                  fogEnabled
                  revealOnSelect={false}
                  revealedCellIds={view.mission.revealedCellIds}
                  cellVisuals={cellVisuals}
                  highlightCellId={
                    showDestinationSpoiler
                      ? view.mission.destinationCellId
                      : null
                  }
                  floatingCellId={interaction?.cellId}
                  floatingContent={interactionDialog}
                />
              </div>
            </CardContent>
          </Card>

          <div className="min-h-0 space-y-4 overflow-y-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5" /> Discoveries
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {view.storyState.knownFacts.length === 0 &&
                view.storyState.inventory.length === 0 ? (
                  <p className="text-muted-foreground">
                    Facts and story-local items appear here as they are found.
                  </p>
                ) : (
                  <>
                    {view.storyState.knownFacts.map((fact) => (
                      <p key={fact} className="capitalize">
                        {fact.replaceAll('-', ' ')}
                      </p>
                    ))}
                    {view.storyState.inventory.map((item) => (
                      <div key={item.key}>
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Footprints className="h-5 w-5" /> Travel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {autoJourneyActive ? (
                  <div
                    aria-live="polite"
                    className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {action.isLoading || view.generationPending ? (
                          <Spinner />
                        ) : (
                          <Footprints className="h-4 w-4 text-primary" />
                        )}
                        Journey continuing
                      </div>
                      <Button
                        aria-label="Pause journey"
                        onClick={() => setAutoTravel(false)}
                        size="sm"
                        variant="outline"
                      >
                        <Pause className="mr-2 h-4 w-4" /> Pause
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {autoJourneyStatus}
                    </p>
                  </div>
                ) : null}
                {view.generationPending ? (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Spinner /> The game master is shaping this encounter...
                  </div>
                ) : interaction ? (
                  <p className="text-sm text-muted-foreground">
                    Resolve the interaction beside your current map cell to
                    continue.
                  </p>
                ) : view.mission.status === 'FAILED' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      This attempt exhausted its travel budget. Its history is
                      preserved; retry from the Chapter checkpoint.
                    </p>
                    <Button
                      disabled={disabled}
                      onClick={() => send({ type: 'RETRY_MISSION' })}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Retry mission
                    </Button>
                  </div>
                ) : view.mission.status === 'SUCCESS' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Chapter complete. The next mission is being prepared from
                      what happened here.
                    </p>
                    <Button asChild>
                      <Link href={`/explore/stories/${storyId}`}>
                        Continue Story
                      </Link>
                    </Button>
                  </div>
                ) : view.mission.travelPlan ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Route planned across{' '}
                      {view.mission.travelPlan.pathCellIds.length} cells with an
                      estimated cost of{' '}
                      {view.mission.travelPlan.estimatedActionCost}.
                    </p>
                    {autoJourneyActive ? (
                      <p className="text-xs text-muted-foreground">
                        Each leg is still submitted, versioned, and saved as a
                        separate travel action.
                      </p>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={disabled}
                        onClick={() => setAutoTravel(true)}
                      >
                        <Footprints className="mr-2 h-4 w-4" /> Start journey
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select any map cell. You can roam freely or choose the
                    highlighted Mission destination to follow the story route.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog
        open={spoilerConfirmationOpen}
        onOpenChange={(open) => {
          if (open) {
            setSpoilerConfirmationOpen(true);
          } else {
            closeSpoilerConfirmation();
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <Eye className="h-5 w-5" />
            </div>
            <DialogTitle>{spoilerWarning.title}</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block italic">{spoilerWarning.description}</span>
              <span className="block not-italic">
                Reveal the Mission destination anyway?
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeSpoilerConfirmation}>
              {spoilerWarning.continueLabel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDestinationSpoiler(true);
                closeSpoilerConfirmation();
              }}
            >
              {spoilerWarning.revealLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default function MissionPage({
  params,
}: {
  params: Promise<{ storyId: string; missionId: string }>;
}) {
  const { storyId, missionId } = React.use(params);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <MissionPageContent
        key={missionId}
        storyId={storyId}
        missionId={missionId}
      />
    </div>
  );
}
