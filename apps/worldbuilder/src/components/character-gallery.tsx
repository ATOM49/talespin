'use client';

import * as React from 'react';
import { Character } from '@talespin/schema';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

interface CharacterGalleryProps {
  name: string;
  images?: Character['gallery'];
  fallbackUrl?: string;
}

const FALLBACK_ANGLE = 'Primary portrait';

export function CharacterGallery({
  name,
  images = [],
  fallbackUrl,
}: CharacterGalleryProps) {
  const [carouselApi, setCarouselApi] = React.useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const galleryImages = React.useMemo(() => {
    if (images.length > 0) {
      return images;
    }

    if (fallbackUrl) {
      return [
        {
          angle: FALLBACK_ANGLE,
          description: 'Auto-generated portrait',
          imageUrl: fallbackUrl,
        },
      ];
    }

    return [];
  }, [images, fallbackUrl]);

  React.useEffect(() => {
    if (!carouselApi) return;

    const handleSelect = () => {
      setCurrentIndex(carouselApi.selectedScrollSnap());
    };

    handleSelect();
    carouselApi.on('select', handleSelect);

    return () => {
      carouselApi.off('select', handleSelect);
    };
  }, [carouselApi]);

  if (galleryImages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-sm text-muted-foreground">
        No concept art available yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <Carousel setApi={setCarouselApi} className="w-full h-full">
          <CarouselContent className="h-full">
            {galleryImages.map((image, index) => (
              <CarouselItem key={`${image.imageUrl}-${index}`}>
                <figure className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                  <img
                    src={image.imageUrl}
                    alt={`${name} ${image.angle}`}
                    className="h-full w-full object-contain"
                  />
                  <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                    {image.angle}
                  </figcaption>
                </figure>
              </CarouselItem>
            ))}
          </CarouselContent>
          {galleryImages.length > 1 && (
            <>
              <CarouselPrevious />
              <CarouselNext />
            </>
          )}
        </Carousel>
      </div>

      <div className="grid h-48 gap-2 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-2 sm:grid-cols-3">
        {galleryImages.map((image, index) => (
          <button
            type="button"
            key={`${image.imageUrl}-thumb-${index}`}
            onClick={() => carouselApi?.scrollTo(index)}
            className={cn(
              'flex flex-col gap-1 rounded-lg border border-transparent bg-background/40 p-2 text-left text-xs transition hover:border-primary/60',
              currentIndex === index &&
                'border-primary shadow-sm ring-2 ring-primary/30',
            )}
          >
            <div className="relative h-20 w-full overflow-hidden rounded-md bg-muted">
              <img
                src={image.imageUrl}
                alt={`${name} ${image.angle} thumbnail`}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="font-semibold text-foreground">{image.angle}</span>
            {image.description && (
              <span className="text-[11px] text-muted-foreground line-clamp-2">
                {image.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
