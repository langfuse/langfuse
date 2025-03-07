import React, { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import Image from "next/image";
import { InfoIcon } from "lucide-react";
import { ActionButton } from "@/src/components/ActionButton";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";

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

export interface SplashScreenProps {
  title: string;
  description: string;
  image?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  videoSrc?: string;
  valuePropositions?: ValueProposition[];
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  gettingStarted?: string | React.ReactNode;
  className?: string;
}

interface VideoPlayerProps {
  videoSrc: string;
}

function VideoPlayer({ videoSrc }: VideoPlayerProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      className={cn(
        "my-6 w-full max-w-3xl overflow-hidden rounded-lg border border-border",
        {
          hidden: !isLoaded || hasError,
        },
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
  image,
  videoSrc,
  valuePropositions = [],
  primaryAction,
  secondaryAction,
  gettingStarted,
}: SplashScreenProps) {
  return (
    <div className={cn("mx-auto flex max-w-4xl flex-col items-center p-8")}>
      <div className="mb-6 text-center">
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
    </div>
  );
}
