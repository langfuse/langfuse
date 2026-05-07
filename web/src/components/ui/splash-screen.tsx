import React, { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import Image from "next/image";
import { InfoIcon } from "lucide-react";
import { ActionButton } from "@/src/components/ActionButton";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";
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
  description: string;
  waitingFor?: string;
  image?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  videoSrc?: string;
  steps?: Step[];
  valuePropositions?: ValueProposition[];
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  gettingStarted?: string | React.ReactNode;
  children?: React.ReactNode;
  /** Where to render the video. Defaults to "top" (after header, before content) */
  videoPosition?: "top" | "bottom";
}

function VideoPlayer({ videoSrc }: { videoSrc: string }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      className={cn(
        "border-border my-6 w-full max-w-3xl overflow-hidden rounded-lg border",
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
  image,
  videoSrc,
  steps,
  valuePropositions = [],
  primaryAction,
  secondaryAction,
  gettingStarted,
  children,
  videoPosition = "top",
}: SplashScreenProps) {
  const mediaBlock = (
    <>
      {videoSrc && <VideoPlayer videoSrc={videoSrc} />}
      {!videoSrc && image && (
        <div className="my-6 w-full max-w-3xl">
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
    <div className="mx-auto flex max-w-4xl flex-col items-center p-8">
      <div className="mb-6 text-center">
        {waitingFor && (
          <StatusBadge
            type="waiting"
            showText={false}
            className="mb-3 px-3 py-1 text-sm"
          >
            {waitingFor}
          </StatusBadge>
        )}
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="mb-8 flex w-full flex-wrap justify-center gap-4">
        {primaryAction &&
          (primaryAction.component || (
            <ActionButton
              size="lg"
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
              size="lg"
              onClick={secondaryAction.onClick}
              href={secondaryAction.href}
            >
              {secondaryAction.label}
            </ActionButton>
          ))}
      </div>

      {gettingStarted && (
        <Alert className="w-full max-w-3xl">
          <InfoIcon className="mr-2 h-4 w-4" />
          <AlertTitle>Getting Started</AlertTitle>
          <AlertDescription>{gettingStarted}</AlertDescription>
        </Alert>
      )}

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

      {children && <div className="my-6 w-full max-w-3xl">{children}</div>}

      {valuePropositions.length > 0 && (
        <div className="my-6 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          {valuePropositions.map((prop, index) => (
            <Alert key={index}>
              {prop.icon}
              <AlertTitle>{prop.title}</AlertTitle>
              <AlertDescription>{prop.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {videoPosition === "bottom" && mediaBlock}
    </div>
  );
}
