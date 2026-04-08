import React from "react";
import { SkillsOnboardingCard } from "@/src/features/setup/components/SkillsOnboardingCard";

interface TracesOnboardingProps {
  projectId: string;
}

export function TracesOnboarding({ projectId }: TracesOnboardingProps) {
  return (
    <div className="space-y-10">
      <SkillsOnboardingCard projectId={projectId} />
    </div>
  );
}
