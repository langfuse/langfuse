import useLocalStorage from "@/src/components/useLocalStorage";
import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { useQueryParam, StringParam } from "use-query-params";

interface EnvironmentVisibility {
  [key: string]: boolean; // environment name -> isVisible
}

export function convertSelectedEnvironmentsToFilter(
  environmentColumns: string[],
  selectedEnvironments: string[],
) {
  if (selectedEnvironments.length === 0) {
    // No environments selected = no filter (show all)
    return [];
  }

  return environmentColumns.map((column) => ({
    type: "stringOptions" as const,
    column,
    operator: "any of" as const,
    value: selectedEnvironments,
  }));
}

export function useEnvironmentFilter(
  availableEnvironments: string[] | undefined,
  projectId: string,
) {
  const [visibilityMap, setVisibilityMap] =
    useLocalStorage<EnvironmentVisibility>(
      `langfuse-environment-visibility-${projectId}`,
      {},
    );

  // URL is the shareable source of truth when present; the localStorage map
  // is the per-browser fallback. Pattern matches useDashboardDateRange and
  // useGlobalDateRange, the established way other Langfuse surfaces plumb
  // URL state.
  const [urlEnvironments, setUrlEnvironments] = useQueryParam(
    "environments",
    StringParam,
  );

  // Pages Router: useQueryParam returns `undefined` until the router is
  // ready (post-hydration). On the first render, treat the URL as not-yet-
  // known and fall back to the localStorage map, then re-derive on the next
  // render when router.isReady flips. This avoids a one-frame flash where
  // the user's URL-driven selection is briefly replaced by their local
  // pick on shared links.
  const router = useRouter();
  const urlIsReady = router.isReady;

  const getDefaultVisibility = (env: string) => !env.startsWith("langfuse-");

  // When the URL carries an explicit (non-empty) list AND the router is
  // ready, that is the source of truth. Empty / missing / not-ready URL
  // falls back to the localStorage map and the existing "langfuse-* hidden
  // by default" rule.
  //
  // Each entry is URL-encoded so an environment name containing a literal
  // comma (unlikely but not schema-forbidden) round-trips intact.
  const urlSelection = useMemo(() => {
    if (!urlIsReady) return null;
    if (typeof urlEnvironments !== "string" || urlEnvironments.length === 0) {
      return null;
    }
    const parsed = urlEnvironments
      .split(",")
      .map((s) => {
        try {
          return decodeURIComponent(s.trim());
        } catch {
          return s.trim();
        }
      })
      .filter((s) => s.length > 0);
    return parsed.length > 0 ? parsed : null;
  }, [urlEnvironments, urlIsReady]);

  const visibleEnvironments = useMemo(() => {
    if (urlSelection !== null) {
      // URL is authoritative. Filter against availableEnvironments so a
      // stale URL referencing a deleted environment does not surface it.
      const set = new Set(urlSelection);
      return (availableEnvironments || []).filter((env) => set.has(env));
    }
    return (availableEnvironments || []).filter((env) => {
      return visibilityMap[env] ?? getDefaultVisibility(env);
    });
  }, [urlSelection, availableEnvironments, visibilityMap]);

  const handleSetVisibilityMap = useCallback(
    (environments: string[]) => {
      const selectedSet = new Set(environments);

      // No-op when the selection has not actually changed. useQueryParam
      // does not deduplicate internally and would otherwise push a duplicate
      // history entry per call.
      const previous = visibleEnvironments;
      if (
        previous.length === environments.length &&
        previous.every((env) => selectedSet.has(env))
      ) {
        return;
      }

      // URL: write the explicit list, or remove the param entirely when the
      // selection is empty (cleaner shareable URL).
      if (environments.length === 0) {
        setUrlEnvironments(undefined);
      } else {
        setUrlEnvironments(
          environments.map((e) => encodeURIComponent(e)).join(","),
        );
      }

      // Bail on the localStorage write when the available-envs list has not
      // yet resolved. Writing against an empty list would erase the user's
      // previous per-env map (selectedSet has only the new env, reduce has
      // no keys, setVisibilityMap({}) — the previous map is lost).
      if (!availableEnvironments || availableEnvironments.length === 0) {
        return;
      }

      // localStorage: keep the per-env visibility map so a navigation away
      // from this page without the URL still shows the user's last pick.
      const map = availableEnvironments.reduce((acc, env) => {
        acc[env] = selectedSet.has(env);
        return acc;
      }, {} as EnvironmentVisibility);
      setVisibilityMap(map);
    },
    [
      availableEnvironments,
      visibleEnvironments,
      setUrlEnvironments,
      setVisibilityMap,
    ],
  );

  // Initialize or update the localStorage map when available environments
  // change. Only runs when the URL is NOT authoritative — when the URL
  // carries an explicit list, that list is the source of truth and adding
  // a new env should default to "not selected" until the user adds it.
  useEffect(() => {
    if (!availableEnvironments || availableEnvironments.length === 0) return;
    if (urlSelection !== null) return;

    const updatedMap = { ...visibilityMap };
    let hasChanges = false;

    availableEnvironments.forEach((env) => {
      // Environments prefixed with "langfuse-" are deselected by default
      if (updatedMap[env] === undefined) {
        updatedMap[env] = getDefaultVisibility(env);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setVisibilityMap(updatedMap);
    }
  }, [availableEnvironments, visibilityMap, urlSelection, setVisibilityMap]);

  return {
    selectedEnvironments: visibleEnvironments,
    setSelectedEnvironments: handleSetVisibilityMap,
  };
}
