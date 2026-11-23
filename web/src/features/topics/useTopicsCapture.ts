import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { useQueryProject } from "@/src/features/projects/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  type TopicsEventInput,
  type TopicsEventMap,
  type TopicsEventName,
} from "./topicsAnalytics";

/** Captures a Topics event with the route's project and its organization. */
export function useTopicsCapture() {
  // TypeScript cannot resolve the registry's conditional parameters for a
  // generic event, so this narrows them to the Topics map.
  const capture = usePostHogClientCapture() as (
    event: TopicsEventName,
    properties: TopicsEventMap[TopicsEventName],
  ) => void;
  const { project, organization } = useQueryProject();
  const projectId = project?.id;
  const orgId = organization?.id;
  return useCallback(
    function captureTopics<E extends TopicsEventName>(
      event: E,
      ...[properties]: TopicsEventInput<E> extends Record<string, never>
        ? []
        : [properties: TopicsEventInput<E>]
    ) {
      // Without both ids the event cannot be counted per project.
      if (!projectId || !orgId) return;
      const payload = {
        ...properties,
        projectId,
        orgId,
        isV4: true,
      } as TopicsEventMap[E];
      // Analytics must never fail the action it reports on.
      try {
        capture(event, payload);
      } catch {
        return;
      }
    },
    [capture, projectId, orgId],
  );
}

/**
 * Runs `onView` once per mount for each new `key`; `null` waits. Views are
 * PostHog's external state, so this is an effect, not a render side effect.
 */
export function useTopicsViewCapture(key: string | null, onView: () => void) {
  const captured = useRef(new Set<string>());
  const view = useEffectEvent(onView);
  useEffect(() => {
    if (key === null || captured.current.has(key)) return;
    captured.current.add(key);
    view();
  }, [key]);
}
