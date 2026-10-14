import { useMemo } from "react";

export function useVariableMappingSync(params: {
  templateVars?: string[];
  currentMapping: { templateVariable: string }[];
}) {
  return useMemo(() => {
    if (!params.templateVars) {
      return { inSync: true, added: [], removed: [], unchanged: [] };
    }

    const templateVarSet = new Set(params.templateVars);
    const mappingVarSet = new Set(
      params.currentMapping.map((m) => m.templateVariable),
    );

    const added = params.templateVars.filter((v) => !mappingVarSet.has(v));
    const removed = params.currentMapping
      .map((m) => m.templateVariable)
      .filter((v) => !templateVarSet.has(v));
    const unchanged = params.templateVars.filter((v) => mappingVarSet.has(v));

    return {
      inSync: added.length === 0 && removed.length === 0,
      added,
      removed,
      unchanged,
    };
  }, [params.templateVars, params.currentMapping]);
}
