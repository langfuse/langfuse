import React from "react";
import Header from "@/src/components/layouts/header";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ScoreConfigsTable } from "@/src/components/table/use-cases/score-configs";

export function ScoreConfigSettings({ projectId }: { projectId: string }) {
  const hasReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "scoreConfigs:read",
  });

  if (!hasReadAccess) return null;

  return (
    <div id="score-configs">
      <Header title="Score Configs" />
      <p className="mb-2 text-sm">
        Score configs define which scores are available for{" "}
        <a
          href="https://langfuse.com/docs/scores/manually"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          annotation
        </a>{" "}
        in your project. Please note that all score configs are immutable.
      </p>
      <ScoreConfigsTable projectId={projectId} />
    </div>
  );
}
