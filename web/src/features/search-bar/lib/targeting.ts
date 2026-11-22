import type { FilterNode } from "./ast";
import type { FieldRegistry, FilterTargeting } from "./fields";
import { quote, quoteIfNeeded, unquote } from "./quoting";

/** The target is separate from the field path, including during partial input. */
export function readTargetPrefix(
  raw: string,
  registry: FieldRegistry,
): {
  target: NonNullable<FilterNode["target"]>;
  length: number;
  incomplete: boolean;
} | null {
  if (!registry.targeting) return null;
  if (raw.startsWith('"')) {
    let end = 1;
    for (; end < raw.length; end++) {
      if (raw[end] === "\\") {
        end++;
        continue;
      }
      if (raw[end] === '"') break;
    }
    if (end >= raw.length || end === raw.length - 1) {
      return {
        target: {
          kind: "name",
          value: unquote(end >= raw.length ? `${raw}"` : raw).value,
        },
        length: raw.length,
        incomplete: true,
      };
    }
    if (raw[end + 1] !== ".") return null;
    const value = unquote(raw.slice(0, end + 1)).value;
    const keyword = registry.targeting.targets.find(
      (target) =>
        target.keyword && /\s/.test(target.label) && target.label === value,
    );
    return {
      target: keyword ? targetReference(keyword) : { kind: "name", value },
      length: end + 2,
      incomplete: false,
    };
  }
  for (const target of registry.targeting.targets) {
    if (!target.keyword) continue;
    // Accept the stable keyword ID as an alias for existing saved searches.
    const prefix = [target.label, target.id]
      .map((label) => `${label}.`)
      .find((prefix) => raw.toLowerCase().startsWith(prefix.toLowerCase()));
    if (prefix) {
      return {
        target:
          prefix === `${target.id}.` && target.label !== target.id
            ? { kind: "keyword", value: target.id }
            : targetReference(target),
        length: prefix.length,
        incomplete: false,
      };
    }
  }
  return null;
}

export function resolveFilterTarget(
  node: FilterNode,
  registry: FieldRegistry,
): { id: string } | { error: string } {
  const capability = registry.targeting;
  if (!capability || !supportsFilterTarget(node, registry)) {
    return { error: "This filter does not support a target" };
  }
  const ref = node.target;
  const matches = capability.targets.filter((target) => {
    if (!ref) return target.id === capability.defaultTarget;
    if (ref.kind === "keyword")
      return (
        target.keyword &&
        (target.label === ref.value || target.id === ref.value)
      );
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

/** Presence predicates inherit the capability of the fields they inspect. */
export function supportsFilterTarget(
  node: FilterNode,
  registry: FieldRegistry,
): boolean {
  const capability = registry.targeting;
  if (!capability) return false;
  const field = registry.resolveField(node.key);
  if (field?.type === "pseudo" && field.id === "has") {
    return (
      node.values.length > 0 &&
      node.values.every((value) => {
        const referenced = registry.resolveField(value);
        return referenced !== null && capability.supports(referenced);
      })
    );
  }
  return field !== null && capability.supports(field);
}

/**
 * Resolve the registry target this filter binds to, or undefined when the
 * field is not targetable and the node carries no explicit target.
 */
export function resolveAttachedTarget(
  node: FilterNode,
  registry: FieldRegistry,
): { id: string } | { error: string } | undefined {
  if (!node.target && !supportsFilterTarget(node, registry)) {
    return undefined;
  }
  return resolveFilterTarget(node, registry);
}

export function targetReference(
  target: FilterTargeting["targets"][number],
): NonNullable<FilterNode["target"]> {
  return { kind: target.keyword ? "keyword" : "name", value: target.label };
}

export function serializeTarget(
  target: NonNullable<FilterNode["target"]>,
): string {
  if (target.kind === "keyword") return `${quoteIfNeeded(target.value)}.`;
  return `${quote(target.value)}.`;
}
