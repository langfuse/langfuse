import React from "react";
import { cn } from "@/src/utils/tailwind";
import Image from "next/image";
import { ActionButton } from "@/src/components/ActionButton";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";

export interface ValueProposition {
  title: string;
  description: string;
  icon?: React.ReactNode;
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
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function SplashScreen({
  title,
  description,
  image,
  videoSrc,
  valuePropositions = [],
  primaryAction,
  secondaryAction,
  className,
}: SplashScreenProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-4xl flex-col items-center p-8",
        className,
      )}
    >
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="mb-8 flex w-full flex-wrap justify-center gap-4">
        {primaryAction && (
          <ActionButton
            size="lg"
            className="w-full sm:w-auto"
            onClick={primaryAction.onClick}
            href={primaryAction.href}
          >
            {primaryAction.label}
          </ActionButton>
        )}

        {secondaryAction && (
          <ActionButton
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={secondaryAction.onClick}
            href={secondaryAction.href}
          >
            {secondaryAction.label}
          </ActionButton>
        )}
      </div>

      {videoSrc && (
        <div className="my-6 w-full max-w-3xl overflow-hidden rounded-lg border border-border">
          <video
            src={videoSrc}
            controls
            autoPlay
            muted
            loop
            controlsList="nodownload"
            className="w-full"
          />
        </div>
      )}

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
        <div className="my-6 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
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
