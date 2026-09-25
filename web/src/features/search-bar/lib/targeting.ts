import type { FilterNode } from "./ast";
import type { FieldRegistry } from "./fields";
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
    if (ref.kind === "id") return target.id === ref.value;
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
  id: string,
  registry: FieldRegistry,
): NonNullable<FilterNode["target"]> {
  const target = registry.targeting?.targets.find((entry) => entry.id === id);
  if (target?.keyword) return { kind: "keyword", value: target.label };
  if (
    target &&
    registry.targeting?.targets.filter(
      (entry) => !entry.keyword && entry.label === target.label,
    ).length === 1
  ) {
    return { kind: "name", value: target.label };
  }
  return { kind: "id", value: id };
}

export function serializeTarget(
  target: NonNullable<FilterNode["target"]>,
): string {
  if (target.kind === "keyword") return `@${target.value}`;
  if (target.kind === "id") return `@id:${quote(target.value)}`;
  return `@${quote(target.value)}`;
}
