'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Character, World } from '@talespin/schema';
import Image from 'next/image';
import Link from 'next/link';

export type WorldDirectoryMode = 'build' | 'explore';

interface WorldCardProps {
  world: World;
  mode: WorldDirectoryMode;
}

export function WorldCard({ world, mode }: WorldCardProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function fetchCharacters() {
      setIsLoadingCharacters(true);
      try {
        const response = await fetch(`/api/worlds/${world._id}/characters`, {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          setCharacters([]);
          return;
        }

        const payload = await response.json();
        const characterData: Character[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

        if (!isCancelled) {
          setCharacters(characterData);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error(
            `Failed to load characters for world ${world._id}`,
            error,
          );
          setCharacters([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCharacters(false);
        }
      }
    }

    fetchCharacters();

    return () => {
      isCancelled = true;
    };
  }, [world._id]);

  const getInitials = (name: string) => {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
        .slice(0, 2) || '??'
    );
  };

  // Explorers go to the character route; builders go to the main world page
  const href =
    mode === 'build'
      ? `/worlds/${world._id}`
      : `/explore/worlds/${world._id}/join`;

  const previewCharacters = characters.slice(0, 4);
  const extraCount = characters.length - previewCharacters.length;

  return (
    <Link href={href} className="group block" prefetch={false}>
      <Card className="overflow-hidden gap-0 p-0 shadow-md transition hover:-translate-y-1 hover:shadow-lg">
        <div className="relative h-48 w-full bg-muted">
          {world.mapImageUrl ? (
            <Image
              src={world.mapImageUrl}
              alt={`${world.name} map`}
              fill
              sizes="(min-width: 1024px) 25vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sidebar-border/40 to-sidebar-accent/40 text-sm font-semibold text-muted-foreground">
              Map preview coming soon
            </div>
          )}
        </div>

        <CardHeader className="px-6 pb-4 pt-6">
          <CardTitle className="text-xl font-semibold">{world.name}</CardTitle>
          <CardDescription className="line-clamp-3">
            {world.description || 'A mysterious realm awaiting its lore.'}
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex items-center justify-between border-t px-6 py-4">
          {isLoadingCharacters ? (
            <p className="text-xs text-muted-foreground">
              Loading characters...
            </p>
          ) : characters.length === 0 ? (
            <p className="text-xs text-muted-foreground">No characters yet</p>
          ) : (
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex -space-x-3">
                {previewCharacters.map((character) => (
                  <Avatar
                    key={character._id}
                    className="h-9 w-9 border border-border bg-background shadow-sm"
                    title={character.name}
                  >
                    <AvatarImage
                      src={character.previewUrl ?? undefined}
                      alt={character.name}
                    />
                    <AvatarFallback>
                      {getInitials(character.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {extraCount > 0 && (
                  <Avatar className="flex h-9 w-9 items-center justify-center border border-border bg-muted text-xs font-semibold uppercase tracking-wide">
                    <AvatarFallback>+{extraCount}</AvatarFallback>
                  </Avatar>
                )}
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {characters.length}{' '}
                {characters.length === 1 ? 'character' : 'characters'}
              </span>
            </div>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
