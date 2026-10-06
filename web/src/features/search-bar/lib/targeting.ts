import type { FilterNode } from "./ast";
import type { FieldRegistry, FilterTargeting } from "./fields";
import { quote } from "./quoting";

export function resolveFilterTarget(
  node: FilterNode,
  registry: FieldRegistry,
): { id: string } | { error: string } {
  const capability = registry.targeting;
  const field = registry.resolveField(node.key);
  if (!capability || !field || !capability.supports(field)) {
    return { error: "This filter does not support a target" };
  }
  const ref = node.target;
  const matches = capability.targets.filter((target) => {
    if (!ref) return target.id === capability.defaultTarget;
    if (ref.kind === "keyword")
      return target.keyword && target.label === ref.value;
    return !target.keyword && target.label === ref.value;
  });
  if (matches.length !== 1) {
    return {
      error:
        matches.length > 1
          ? "Target name is ambiguous; select a specific target"
          : "Target is unavailable; select an available target",
    };
  }
  return { id: matches[0].id };
}

export function targetReference(
  target: FilterTargeting["targets"][number],
): NonNullable<FilterNode["target"]> {
  return { kind: target.keyword ? "keyword" : "name", value: target.label };
}

export function serializeTarget(
  target: NonNullable<FilterNode["target"]>,
): string {
  if (target.kind === "keyword") return `@${target.value}`;
  return `@${quote(target.value)}`;
}
