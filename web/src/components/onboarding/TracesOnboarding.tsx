import React from "react";
import { TracesSetupOnboardingCard } from "@/src/features/setup/components/TracesSetupOnboardingCard";

interface TracesOnboardingProps {
  projectId: string;
}

export function TracesOnboarding({ projectId }: TracesOnboardingProps) {
  return (
    <div className="space-y-10">
      <TracesSetupOnboardingCard projectId={projectId} />
    </div>
  );
}
