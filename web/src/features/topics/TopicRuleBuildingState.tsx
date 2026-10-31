import { Button } from "@/src/components/design-system/Button/Button";
import { type TopicRuleMap } from "./topic-maps";

/** Shown on a rule map until its first refit has published topics. */
export function TopicRuleBuildingState({
  rule,
  canWrite,
  onProcessPastTraces,
}: {
  rule: TopicRuleMap;
  canWrite: boolean;
  onProcessPastTraces: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-bold">Building first topics</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        New traces matching {rule.name} are summarized as they arrive, and the
        first map is published at the next refit. Process past traces to start
        from history instead of waiting.
      </p>
      <Button
        text="Process past traces"
        disabled={!canWrite}
        onClick={onProcessPastTraces}
      />
    </div>
  );
}
