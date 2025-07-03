import React from "react";

import { cn } from "@/src/utils/tailwind";
import { type SyncSettings } from "@/src/features/playground/page/types";
import { useMultiPlaygroundContext } from "@/src/features/playground/page/context/multi-playground-context";
import { SyncToggle } from "./SyncToggle";

interface SyncableSectionProps {
  title: string;
  syncKey: keyof SyncSettings;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export const SyncableSection: React.FC<SyncableSectionProps> = ({
  title,
  syncKey,
  children,
  className,
  headerClassName,
}) => {
  const { syncSettings, toggleSync } = useMultiPlaygroundContext();
  const isLinked = syncSettings[syncKey];

  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn("flex items-center justify-between", headerClassName)}>
        <h3 className="font-semibold text-sm">{title}</h3>
        <SyncToggle
          syncKey={syncKey}
          isEnabled={isLinked}
          onToggle={() => toggleSync(syncKey)}
        />
      </div>
      <div
        className={cn(
          "transition-opacity duration-200",
          isLinked && "opacity-90" // Subtle visual indication of sync state
        )}
      >
        {children}
      </div>
    </div>
  );
};