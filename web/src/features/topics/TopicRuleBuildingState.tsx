import { type TopicRuleMap } from "./topic-maps";

/** Shown on a rule map until its first topics are published. */
export function TopicRuleBuildingState({ rule }: { rule: TopicRuleMap }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-bold">Building first topics</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        New traces matching {rule.name} are summarized as they arrive. Topics
        appear once enough of them are summarized.
      </p>
    </div>
  );
}
