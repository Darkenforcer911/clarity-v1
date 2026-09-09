"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

export type ClarityViewerImage = {
  id: string;
  src: string;
  alt: string;
};

export function ClarityImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ClarityViewerImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const image = images[index];

  useEffect(() => {
    activeElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      activeElementRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (event.key === "ArrowRight" && index < images.length - 1) {
        onIndexChange(index + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [images.length, index, onClose, onIndexChange]);

  if (!image) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-[70] flex h-[100dvh] w-screen min-w-0 flex-col overflow-hidden bg-black/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4">
        <span className="text-sm text-white/70">
          {images.length > 1 ? `${index + 1} of ${images.length}` : "Photo"}
        </span>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
          aria-label="Close image viewer"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div
        className="flex min-h-0 min-w-0 flex-1 touch-pinch-zoom items-center justify-center overflow-auto overscroll-contain px-3 py-4"
        onTouchStart={(event) => {
          touchStartXRef.current =
            event.touches.length === 1 ? event.touches[0]?.clientX ?? null : null;
        }}
        onTouchEnd={(event) => {
          const startX = touchStartXRef.current;
          touchStartXRef.current = null;
          if (startX === null || event.changedTouches.length !== 1) return;
          const distance = (event.changedTouches[0]?.clientX ?? startX) - startX;
          if (distance > 48 && index > 0) onIndexChange(index - 1);
          if (distance < -48 && index < images.length - 1) {
            onIndexChange(index + 1);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private and draft media use ephemeral URLs. */}
        <img
          key={image.id}
          src={image.src}
          alt={image.alt}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
        />
      </div>

      {images.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-5 px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            aria-label="Previous image"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            aria-label="Next image"
            disabled={index === images.length - 1}
            onClick={() => onIndexChange(index + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
