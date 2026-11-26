import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type RouterInput } from "@/src/utils/types";
import { useMutation } from "@tanstack/react-query";

type PublishObjectProps = {
  kind: "trace" | "session";
  projectId: string;
  objectId: string;
  timestamp?: Date;
};

/** Publish toggle for a trace or a session with optimistic detail-query updates. */
export function usePublishObject(props: PublishObjectProps) {
  const { kind, projectId, objectId, timestamp } = props;
  const { isV4 } = useReadPath();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "objects:publish",
  });
  const utils = api.useUtils();
  const traceQueryInput: RouterInput["traces"]["byIdWithObservationsAndScores"] =
    { projectId, traceId: objectId, timestamp };
  const eventsTraceQueryInput: RouterInput["events"]["byTraceId"] = {
    projectId,
    traceId: objectId,
    timestamp,
  };
  const sessionQueryInput = { projectId, sessionId: objectId };

  const mutation = useMutation({
    meta: { toastOperation: "sharing.update" },
    mutationFn: (isPublic: boolean) =>
      kind === "trace"
        ? utils.client.traces.publish.mutate({
            projectId,
            traceId: objectId,
            public: isPublic,
          })
        : utils.client.sessions.publish.mutate({
            projectId,
            sessionId: objectId,
            public: isPublic,
          }),
    onMutate: async (isPublic) => {
      if (kind === "session") {
        await Promise.all([
          utils.sessions.byIdWithScores.cancel(sessionQueryInput),
          utils.sessions.byIdWithScoresFromEvents.cancel(sessionQueryInput),
        ]);
        const previousSession =
          utils.sessions.byIdWithScores.getData(sessionQueryInput);
        const previousSessionFromEvents =
          utils.sessions.byIdWithScoresFromEvents.getData(sessionQueryInput);
        utils.sessions.byIdWithScores.setData(sessionQueryInput, (old) =>
          old ? { ...old, public: isPublic } : old,
        );
        utils.sessions.byIdWithScoresFromEvents.setData(
          sessionQueryInput,
          (old) => (old ? { ...old, public: isPublic } : old),
        );
        return { previousSession, previousSessionFromEvents };
      }

      if (isV4) {
        await utils.events.byTraceId.cancel(eventsTraceQueryInput);

        const previousEvents = utils.events.byTraceId.getData(
          eventsTraceQueryInput,
        );

        utils.events.byTraceId.setData(eventsTraceQueryInput, (old) => {
          if (!old) return old;

          return {
            ...old,
            observations: old.observations.map((observation) =>
              !observation.parentObservationId
                ? { ...observation, public: isPublic }
                : observation,
            ),
          };
        });

        return { previousEvents };
      }

      await utils.traces.byIdWithObservationsAndScores.cancel(traceQueryInput);

      const previousTrace =
        utils.traces.byIdWithObservationsAndScores.getData(traceQueryInput);

      utils.traces.byIdWithObservationsAndScores.setData(
        traceQueryInput,
        (old) => (old ? { ...old, public: isPublic } : old),
      );

      return { previousTrace };
    },
    onError: (err, input, context) => {
      if (kind === "session") {
        utils.sessions.byIdWithScores.setData(
          sessionQueryInput,
          context?.previousSession,
        );
        utils.sessions.byIdWithScoresFromEvents.setData(
          sessionQueryInput,
          context?.previousSessionFromEvents,
        );
      } else if (isV4) {
        utils.events.byTraceId.setData(
          eventsTraceQueryInput,
          context?.previousEvents,
        );
      } else {
        utils.traces.byIdWithObservationsAndScores.setData(
          traceQueryInput,
          context?.previousTrace,
        );
      }
      trpcErrorToast(err, input ? "sharing.enable" : "sharing.disable");
    },
    onSuccess: async () => {
      if (kind === "session") {
        await utils.sessions.invalidate();
      } else if (!isV4) {
        await utils.traces.all.invalidate();
      }
    },
  });

  const toggle = (isPublic: boolean) => {
    capture(
      kind === "trace"
        ? "trace_detail:publish_button_click"
        : "session_detail:publish_button_click",
    );
    return mutation.mutateAsync(isPublic);
  };

  return { hasAccess, isPending: mutation.isPending, toggle };
}

const getShareUrlWithBasePath = (shareUrl: string) => {
  const basePath = (env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  const shouldPrependBasePath =
    Boolean(basePath) &&
    shareUrl.startsWith("/") &&
    !shareUrl.startsWith("//") &&
    shareUrl !== basePath &&
    !shareUrl.startsWith(`${basePath}/`);

  return shouldPrependBasePath ? `${basePath}${shareUrl}` : shareUrl;
};

export const getShareUrl = (shareUrl?: string) =>
  shareUrl
    ? new URL(
        getShareUrlWithBasePath(shareUrl),
        window.location.origin,
      ).toString()
    : window.location.href;
