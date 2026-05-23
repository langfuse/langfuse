import Image from "next/image";
import type { MouseEvent } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";

export const setupMomentImageMarker = "[ image of setup, aha, habit moment ]";
export const currentDashboardImageMarker =
  "[ image of current langfuse dashboard ]";
export const videoPlaceholderMarker = "[ video placeholder ]";

function SpielwieseIntroCurrentDashboardZoom({
  onClose,
  onImageClick,
}: {
  onClose: () => void;
  onImageClick: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-label="Current Langfuse empty dashboard preview"
      aria-modal="true"
      className="animate-spielwiese-intro-zoom-backdrop-in fixed inset-0 z-[140] flex items-center justify-center bg-white/92 p-4 backdrop-blur-[2px] sm:p-8"
      data-testid="spielwiese-intro-current-dashboard-zoom"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="animate-spielwiese-intro-zoom-panel-in max-h-[72dvh] max-w-[min(82vw,70rem)] overflow-hidden rounded-[1rem] border border-[rgba(0,0,0,0.08)] bg-white will-change-[transform,opacity]"
        onClick={onImageClick}
      >
        <Image
          alt="Current Langfuse empty dashboard"
          className="block h-auto max-h-[72dvh] w-auto max-w-[min(82vw,70rem)] object-contain"
          height={1804}
          sizes="min(82vw, 70rem)"
          src="/spielwiese/langfuse-current-dashboard.png"
          width={3024}
        />
      </div>
    </div>
  );
}

export function SpielwieseIntroSetupMomentImage() {
  return (
    <div
      className="overflow-hidden rounded-[1rem] border border-[rgba(0,0,0,0.08)] bg-[rgba(247,247,247,0.72)]"
      data-testid="spielwiese-intro-setup-moment-image"
    >
      <Image
        alt="Setup, aha, and habit moment sketch"
        className="block h-auto w-full"
        height={594}
        priority
        sizes="(max-width: 640px) calc(100vw - 2.5rem), 550px"
        src="/spielwiese/setup-aha-habit-moment.png"
        width={1698}
      />
    </div>
  );
}

export function SpielwieseIntroCurrentDashboardImage() {
  const [isZoomed, setIsZoomed] = useState(false);

  function openZoomedImage() {
    setIsZoomed(true);
  }

  function closeZoomedImage() {
    setIsZoomed(false);
  }

  function keepZoomedImageOpen(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  const zoomedImage =
    isZoomed && typeof document !== "undefined"
      ? createPortal(
          <SpielwieseIntroCurrentDashboardZoom
            onClose={closeZoomedImage}
            onImageClick={keepZoomedImageOpen}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <button
        aria-label="Zoom current Langfuse empty dashboard"
        className="block w-full overflow-hidden rounded-[1rem] border border-[rgba(0,0,0,0.08)] bg-[rgba(247,247,247,0.7)] text-left transition-opacity duration-150 hover:opacity-86"
        data-testid="spielwiese-intro-current-dashboard-image"
        onClick={openZoomedImage}
        type="button"
      >
        <div className="relative w-full" style={{ paddingBottom: "59.66%" }}>
          <Image
            alt="Current Langfuse empty dashboard"
            className="absolute inset-0 h-full w-full rounded-[1rem] object-cover"
            height={1804}
            sizes="(max-width: 640px) calc(100vw - 2.5rem), 550px"
            src="/spielwiese/langfuse-current-dashboard.png"
            width={3024}
          />
        </div>
      </button>
      {zoomedImage}
    </>
  );
}

export function SpielwieseIntroVideoPlaceholder() {
  return (
    <div
      className="overflow-hidden rounded-[1rem] border border-[rgba(0,0,0,0.08)] bg-[rgba(247,247,247,0.7)]"
      data-testid="spielwiese-intro-video-shell"
    >
      <div className="relative w-full" style={{ paddingBottom: "62.9%" }}>
        <iframe
          allow="clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full rounded-[1rem] border-0"
          data-testid="spielwiese-intro-video-embed"
          loading="lazy"
          src="https://supercut.ai/embed/evren/oytU71kWAMHfHJtASg8NA2?embed=full"
          title="Langfuse Redesign Concept"
        />
      </div>
    </div>
  );
}
