import { type TopicRuleMap } from "./topic-maps";

/** Shown on a rule map until its first topics are published. */
export function TopicRuleBuildingState({
  rule,
  mapBuilt,
}: {
  rule: TopicRuleMap;
  /** Setup built the first map, which the results have not loaded yet. */
  mapBuilt: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-bold">Building first topics</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        {mapBuilt
          ? `First topics for ${rule.name} are ready and appear in a moment.`
          : `Setup could not build topics for ${rule.name} yet. New matching traces are analyzed as they arrive, and first topics appear after the nightly update.`}
      </p>
    </div>
  );
}
