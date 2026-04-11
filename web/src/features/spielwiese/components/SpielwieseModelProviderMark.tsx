"use client";

import { env } from "@/src/env.mjs";
import { Cpu } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import {
  getModelProvider,
  spielwieseModelProviders,
} from "./spielwieseModelCatalog";
import type { SpielwieseModelProvider } from "./spielwieseModelCatalog";

function getProviderById(providerId: string) {
  return (
    spielwieseModelProviders.find((provider) => provider.id === providerId) ??
    null
  );
}

function getResolvedProvider({
  currentModel,
  providerId,
}: {
  currentModel?: string;
  providerId?: string;
}) {
  if (currentModel) {
    return getModelProvider(currentModel);
  }

  if (providerId) {
    return getProviderById(providerId);
  }

  return null;
}

export function SpielwieseModelProviderMark({
  className,
  currentModel,
  providerId,
}: {
  className?: string;
  currentModel?: string;
  providerId?: SpielwieseModelProvider["id"];
}) {
  const provider = getResolvedProvider({ currentModel, providerId });

  if (!provider?.iconSrc) {
    return (
      <Cpu
        aria-hidden="true"
        className={cn("size-3.5", className)}
        data-testid="spielwiese-provider-mark-fallback"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className={cn("size-3.5 object-contain", className)}
      data-testid={`spielwiese-provider-mark-${provider.id}`}
      height={14}
      src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}${provider.iconSrc}`}
      width={14}
    />
  );
}
