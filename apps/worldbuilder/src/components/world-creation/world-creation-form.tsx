'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import {
  WorldCreationSeedSchema,
  WorldGenerationJobSchema,
  type WorldCreationSeed,
  type WorldGenerationJob,
} from '@talespin/schema';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  GenerationTimeline,
  type GenerationState,
} from '@/components/world-creation/generation-timeline';

const THEME_OPTIONS = [
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'sci‑fi', label: 'Science fiction' },
  { value: 'modern', label: 'Modern' },
  { value: 'historical', label: 'Historical' },
  { value: 'post‑apocalyptic', label: 'Post-apocalyptic' },
] as const;

const ACTIVE_JOB_KEY = 'talespin:active-world-generation-job';
const POLL_INTERVAL_MS = 2000;

type CreationSummary = NonNullable<WorldGenerationJob['result']>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getErrorMessage = async (response: Response) => {
  const fallback = 'World generation failed. Please try again.';
  try {
    const body = (await response.json()) as unknown;
    if (isRecord(body)) {
      if (typeof body.error === 'string') return body.error;
      if (typeof body.message === 'string') return body.message;
    }
  } catch {
    // The status code is still useful when the server did not return JSON.
  }
  return `${fallback} (${response.status})`;
};

const parseJobResponse = async (response: Response) => {
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
  return WorldGenerationJobSchema.parse(await response.json());
};

const stateForJob = (job: WorldGenerationJob): GenerationState => {
  if (
    job.retryable &&
    (job.status === 'GENERATING' || job.status === 'PERSISTING')
  ) {
    return 'error';
  }

  switch (job.status) {
    case 'QUEUED':
      return 'queued';
    case 'GENERATING':
      return 'generating';
    case 'PERSISTING':
      return 'persisting';
    case 'COMPLETED':
      return 'complete';
    case 'FAILED':
      return 'error';
  }
};

export function WorldCreationForm() {
  const router = useRouter();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestJobRef = useRef<WorldGenerationJob | null>(null);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<WorldGenerationJob | null>(null);
  const [generationState, setGenerationState] =
    useState<GenerationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CreationSummary | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isRetryingJob, setIsRetryingJob] = useState(false);
  const [isRecoveringJob, setIsRecoveringJob] = useState(true);

  const isLocked = Boolean(jobId) || isCreatingJob;
  const isDispatching = isCreatingJob || isRetryingJob;
  const canSubmit =
    !isRecoveringJob && theme.length > 0 && description.trim().length > 0;

  const completionItems = summary
    ? [
        { label: 'Regions', value: summary.regions },
        { label: 'Factions', value: summary.factions },
        { label: 'Characters', value: summary.characters },
      ]
    : [];

  const enterWorld = useCallback(
    (worldId: string) => {
      router.replace(`/worlds/${encodeURIComponent(worldId)}/regions`);
    },
    [router],
  );

  const rememberJob = useCallback(
    (nextJobId: string) => {
      window.localStorage.setItem(ACTIVE_JOB_KEY, nextJobId);
      setJobId(nextJobId);
      router.replace(`/worlds/new?job=${encodeURIComponent(nextJobId)}`, {
        scroll: false,
      });
    },
    [router],
  );

  const applyJob = useCallback(
    (nextJob: WorldGenerationJob) => {
      const currentJob = latestJobRef.current;
      if (
        currentJob &&
        (currentJob.status === 'COMPLETED' ||
          nextJob.attempt < currentJob.attempt ||
          (nextJob.attempt === currentJob.attempt &&
            Date.parse(nextJob.updatedAt) < Date.parse(currentJob.updatedAt)))
      ) {
        return;
      }
      latestJobRef.current = nextJob;
      setJob(nextJob);
      setJobId(nextJob.jobId);
      setName(nextJob.seed.name ?? '');
      setTheme(nextJob.seed.theme);
      setDescription(nextJob.seed.description);
      setGenerationState(stateForJob(nextJob));
      setError(nextJob.error ?? null);

      if (nextJob.status === 'COMPLETED' && nextJob.result) {
        setSummary(nextJob.result);
        window.localStorage.removeItem(ACTIVE_JOB_KEY);
        if (!redirectTimerRef.current) {
          redirectTimerRef.current = setTimeout(() => {
            enterWorld(nextJob.result!.worldId);
          }, 1800);
        }
      } else {
        setSummary(null);
      }
    },
    [enterWorld],
  );

  const loadJob = useCallback(
    async (nextJobId: string) => {
      const response = await fetch(
        `/api/worlds/generate/${encodeURIComponent(nextJobId)}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      const nextJob = await parseJobResponse(response);
      applyJob(nextJob);
      return nextJob;
    },
    [applyJob],
  );

  const retryJob = useCallback(
    async (nextJobId: string) => {
      if (isRetryingJob) return;
      setIsRetryingJob(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/worlds/generate/${encodeURIComponent(nextJobId)}/retry`,
          { method: 'POST', credentials: 'same-origin' },
        );
        if (response.status === 409) {
          await loadJob(nextJobId);
          return;
        }
        applyJob(await parseJobResponse(response));
      } catch (caught) {
        const runnerError =
          caught instanceof Error
            ? caught.message
            : 'Unable to start the saved world generation job.';
        let refreshedJob: WorldGenerationJob | undefined;
        try {
          refreshedJob = await loadJob(nextJobId);
        } catch {
          // The runner error below remains the actionable status.
        }
        if (!refreshedJob || refreshedJob.retryable) {
          setError(runnerError);
        }
      } finally {
        setIsRetryingJob(false);
      }
    },
    [applyJob, isRetryingJob, loadJob],
  );

  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      const urlJobId = new URL(window.location.href).searchParams.get('job');
      const savedJobId = window.localStorage.getItem(ACTIVE_JOB_KEY);
      const recoverableJobId = urlJobId || savedJobId;
      if (!recoverableJobId) {
        setIsRecoveringJob(false);
        return;
      }

      try {
        rememberJob(recoverableJobId);
        await loadJob(recoverableJobId);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to recover the saved world generation job.',
          );
        }
      } finally {
        if (!cancelled) setIsRecoveringJob(false);
      }
    };

    void recover();
    return () => {
      cancelled = true;
    };
  }, [loadJob, rememberJob]);

  useEffect(() => {
    if (
      !jobId ||
      job?.status === 'COMPLETED' ||
      job?.status === 'FAILED' ||
      (job?.retryable && job.status !== 'QUEUED')
    ) {
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        await loadJob(jobId);
      } catch {
        // A later poll or the runner response can still recover status.
      } finally {
        if (!cancelled) timeout = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    timeout = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [job, jobId, loadJob]);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    [],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked || isRecoveringJob) return;

    setError(null);
    setSummary(null);

    const parsed = WorldCreationSeedSchema.safeParse({
      name: name.trim() || undefined,
      theme,
      description: description.trim(),
    });

    if (!parsed.success) {
      setGenerationState('error');
      setError(
        parsed.error.issues[0]?.message ??
          'Add a theme and a short description to begin.',
      );
      return;
    }

    setIsCreatingJob(true);
    setGenerationState('queued');

    try {
      const seed: WorldCreationSeed = parsed.data;
      const response = await fetch('/api/worlds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(seed),
      });
      const createdJob = await parseJobResponse(response);
      rememberJob(createdJob.jobId);
      applyJob(createdJob);
    } catch (caught) {
      setGenerationState('error');
      setError(
        caught instanceof Error
          ? caught.message
          : 'World generation failed. Please try again.',
      );
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleRetry = () => {
    if (!job || !job.retryable || isRetryingJob) return;
    setGenerationState('queued');
    void retryJob(job.jobId);
  };

  const handleStartOver = () => {
    if (isDispatching) return;
    window.localStorage.removeItem(ACTIVE_JOB_KEY);
    setJobId(null);
    setJob(null);
    latestJobRef.current = null;
    setSummary(null);
    setError(null);
    setGenerationState('idle');
    router.replace('/worlds/new', { scroll: false });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Card className="border-primary/15 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Give the world a spark</CardTitle>
          <CardDescription className="max-w-2xl leading-relaxed">
            A few sentences are enough. Talespin will expand the idea into a
            map, distinct regions, factions, characters, and the relationships
            that make the setting feel inhabited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="world-name">World name</Label>
              <Input
                id="world-name"
                name="name"
                placeholder="Optional — Talespin can name it"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isLocked}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Leave this blank if discovering the name is part of the fun.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="world-theme">Theme</Label>
              <Select
                value={theme}
                onValueChange={setTheme}
                disabled={isLocked}
                required
              >
                <SelectTrigger id="world-theme" className="w-full">
                  <SelectValue placeholder="Choose a creative direction" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="world-description">The core idea</Label>
              <Textarea
                id="world-description"
                name="description"
                placeholder="For example: An archipelago carried on the backs of sleeping giants, where rival lighthouse guilds compete to predict when each island will wake."
                className="min-h-36 resize-y leading-relaxed"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isLocked}
                required
              />
              <p className="text-xs text-muted-foreground">
                Mention the conflict, mood, or strange rule you most want the
                world to preserve.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Creation paused</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  {job?.blueprintAvailable && (
                    <p className="mt-2">
                      Your completed blueprint is saved; retrying will reuse it
                      instead of calling the watcher again.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {job && !summary && !error && (
              <Alert>
                <AlertTitle>
                  {job.status === 'QUEUED'
                    ? 'Creation job queued'
                    : job.status === 'PERSISTING'
                      ? 'Blueprint saved'
                      : 'Creation in progress'}
                </AlertTitle>
                <AlertDescription>
                  {job.attempt === 0
                    ? 'Waiting for the first worker attempt.'
                    : `Attempt ${job.attempt}.`}{' '}
                  This page is polling the saved job; you can return with this
                  URL if the browser is closed.
                </AlertDescription>
              </Alert>
            )}

            {summary && (
              <Alert className="border-primary/30 bg-primary/5">
                <CheckCircle2 className="text-primary" />
                <AlertTitle>Your world is ready</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {completionItems.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-md border bg-background px-3 py-2 text-center"
                      >
                        <p className="text-lg font-semibold text-foreground">
                          {item.value}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3">Opening the regional atlas…</p>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push('/worlds')}
                  disabled={isDispatching}
                >
                  <ArrowLeft />
                  Back to worlds
                </Button>
                {jobId &&
                  job?.status !== 'COMPLETED' &&
                  (!job || job.retryable) &&
                  !isDispatching && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleStartOver}
                    >
                      Start over
                    </Button>
                  )}
              </div>
              {summary ? (
                <Button
                  type="button"
                  onClick={() => enterWorld(summary.worldId)}
                >
                  Enter world
                  <ArrowRight />
                </Button>
              ) : job?.retryable ? (
                <Button
                  type="button"
                  size="lg"
                  onClick={handleRetry}
                  disabled={isRetryingJob}
                >
                  <RefreshCcw />
                  {isRetryingJob
                    ? 'Requeuing saved job…'
                    : job.blueprintAvailable
                      ? 'Resume saved blueprint'
                      : 'Retry creation'}
                </Button>
              ) : job ? (
                <Button type="button" size="lg" disabled>
                  <Sparkles />
                  {job.status === 'QUEUED'
                    ? 'Queued for background worker…'
                    : job.status === 'PERSISTING'
                      ? 'Saving your world…'
                      : 'Creating your world…'}
                </Button>
              ) : jobId ? (
                <Button
                  type="button"
                  size="lg"
                  onClick={() => void loadJob(jobId)}
                >
                  <RefreshCcw />
                  Retry job status
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canSubmit || isCreatingJob}
                >
                  <Sparkles />
                  {isCreatingJob
                    ? 'Saving creation job…'
                    : 'Create living world'}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit bg-muted/35 lg:sticky lg:top-6">
        <CardContent>
          <GenerationTimeline state={generationState} />
        </CardContent>
      </Card>
    </div>
  );
}
