import type { MouseEvent } from "react";
import { getSpielwieseAssetPath } from "../../spielwieseAssetPath";

type SpielwieseOnboardingWordmarkButtonProps = {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

function LangfuseWordmark() {
  return (
    <div className="flex h-6 items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden="true"
        className="h-[1.125rem] w-auto shrink-0"
        height="18"
        src={getSpielwieseAssetPath("/spielwiese/lf-onboarding-wordmark.png")}
        width="98"
      />
    </div>
  );
}

export default function SpielwieseOnboardingWordmarkButton({
  onClick,
}: SpielwieseOnboardingWordmarkButtonProps) {
  return (
    <button
      aria-label="Langfuse"
      className="group relative inline-flex h-8 items-center justify-center overflow-visible"
      onClick={onClick}
      type="button"
    >
      <LangfuseWordmark />
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-full h-8 w-44 -translate-y-1/2"
        data-testid="spielwiese-onboarding-wordmark-hover-zone"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 text-[0.75rem]/4 font-medium tracking-[-0.01em] whitespace-nowrap text-[rgba(0,0,0,0.42)] opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
        data-testid="spielwiese-onboarding-wordmark-caption"
      >
        for the fun of it
      </span>
    </button>
  );
}
