import { QueryCompileError } from "../../../server/query-ast/errors";

/**
 * The own entry `name` of `registry`; throws `QueryCompileError` naming
 * `kind` and `registryName` when it has none. An inherited key such as
 * `constructor` counts as none.
 */
export function entryOf<T>(
  registry: Readonly<Record<string, T>>,
  name: string,
  kind: "Dimension" | "Measure",
  registryName: string,
): T {
  const entry = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (entry === undefined) {
    throw new QueryCompileError(
      `${kind} "${name}" has no entry in ${registryName}.`,
    );
  }
  return entry;
}
