import Header from "@/src/components/layouts/header";
import { ConnectedScoreConfigsTable } from "@/src/features/score-configs/ScoreConfigsTable/ConnectedScoreConfigsTable";

export function ScoreConfigSettings({ projectId }: { projectId: string }) {
  return (
    <div id="score-configs">
      <Header title="Score Configs" />
      <p className="mb-2 text-sm">
        Score configs define which scores are available for{" "}
        <a
          href="https://langfuse.com/docs/evaluation/evaluation-methods/annotation"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          annotation
        </a>{" "}
        and API/SDK scoring in your project. Data type cannot be changed after
        creation. You can edit the name, description, range, and categories
        where supported. Changes affect future scoring wherever the score config
        is used.
      </p>
      <ConnectedScoreConfigsTable projectId={projectId} />
    </div>
  );
}
