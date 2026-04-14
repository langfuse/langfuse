import React, { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import Image from "next/image";
import { ActionButton } from "@/src/components/ActionButton";
import { StatusBadge } from "@/src/components/layouts/status-badge";

export interface ValueProposition {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export interface ActionConfig {
  label: string;
  href?: string;
  onClick?: () => void;
  component?: React.ReactNode;
}

export interface Step {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  content?: React.ReactNode;
}

export interface SplashScreenProps {
  title: string;
  description: string | React.ReactNode;
  /** Shows a "waiting" status badge above the title */
  waitingFor?: string;
  videoSrc?: string;
  image?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  /** Numbered step layout, rendered below the header */
  steps?: Step[];
  valuePropositions?: ValueProposition[];
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  gettingStarted?: string | React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Where to render the video. Defaults to "top" (after header, before content) */
  videoPosition?: "top" | "bottom";
}

function VideoPlayer({ videoSrc }: { videoSrc: string }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      className={cn(
        "border-border my-4 w-full max-w-3xl overflow-hidden rounded-lg border",
        { hidden: !isLoaded || hasError },
      )}
    >
      <video
        src={videoSrc}
        controls
        autoPlay
        muted
        loop
        playsInline
        controlsList="nodownload"
        className="w-full"
        onError={() => setHasError(true)}
        onLoadedData={() => setIsLoaded(true)}
      />
    </div>
  );
}

export function SplashScreen({
  title,
  description,
  waitingFor,
  videoSrc,
  image,
  steps,
  valuePropositions = [],
  primaryAction,
  secondaryAction,
  gettingStarted,
  children,
  className,
  videoPosition = "top",
}: SplashScreenProps) {
  const hasActions = primaryAction || secondaryAction;
  const hasBody = steps?.length || valuePropositions.length || children;

  const mediaBlock = (
    <>
      {videoSrc && <VideoPlayer videoSrc={videoSrc} />}
      {!videoSrc && image && (
        <div className="mt-4 w-full max-w-3xl">
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            className="rounded-md"
          />
        </div>
      )}
    </>
  );

  return (
    <section className={cn("bg-background", className)}>
      <div className="mx-auto flex max-w-4xl flex-col px-6 py-5 sm:px-10 sm:py-6">
        {/* Header */}
        <div className={cn("text-left", hasBody ? "mb-6" : "mb-4")}>
          {waitingFor && (
            <StatusBadge
              type="waiting"
              showText={false}
              className="mb-3 px-3 py-1 text-sm"
            >
              {waitingFor}
            </StatusBadge>
          )}
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-3xl text-base leading-7">
            {description}
          </p>

          {hasActions && (
            <div className="mt-4 flex flex-wrap gap-2">
              {primaryAction &&
                (primaryAction.component || (
                  <ActionButton
                    onClick={primaryAction.onClick}
                    href={primaryAction.href}
                  >
                    {primaryAction.label}
                  </ActionButton>
                ))}
              {secondaryAction &&
                (secondaryAction.component || (
                  <ActionButton
                    variant="outline"
                    onClick={secondaryAction.onClick}
                    href={secondaryAction.href}
                  >
                    {secondaryAction.label}
                  </ActionButton>
                ))}
            </div>
          )}
        </div>

        {videoPosition === "top" && mediaBlock}

        {/* Numbered steps */}
        {steps && steps.length > 0 && (
          <div className="w-full max-w-4xl">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-4">
                {/* Left: circle + connecting line */}
                <div className="flex flex-col items-center">
                  <div className="bg-foreground text-background flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="bg-border mt-1 w-px flex-1" />
                  )}
                </div>
                {/* Right: title + content */}
                <div
                  className={cn(
                    "min-w-0 flex-1 pt-1",
                    index < steps.length - 1 ? "pb-8" : "pb-0",
                  )}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="text-xl font-semibold">{step.title}</h3>
                    {step.badge}
                  </div>
                  {step.description && (
                    <p className="text-muted-foreground text-sm leading-6">
                      {step.description}
                    </p>
                  )}
                  {step.content && <div className="mt-3">{step.content}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Value propositions */}
        {valuePropositions.length > 0 && (
          <div className="mt-5 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
            {valuePropositions.map((prop, index) => (
              <div key={index} className="flex gap-3">
                {prop.icon && (
                  <div className="text-muted-foreground mt-0.5 shrink-0">
                    {prop.icon}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{prop.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {prop.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Getting started */}
        {gettingStarted && (
          <p className="text-muted-foreground mt-4 text-sm">{gettingStarted}</p>
        )}

        {/* Children */}
        {children && (
          <div className="mt-4 w-full max-w-3xl">{children}</div>
        )}

        {videoPosition === "bottom" && mediaBlock}
      </div>
    </section>
  );
}
