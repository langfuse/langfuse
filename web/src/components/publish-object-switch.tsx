import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type RouterInput } from "@/src/utils/types";
import { CheckIcon, Globe, Link, Share2 } from "lucide-react";
import { useState } from "react";

export const PublishTraceSwitch = (props: {
  traceId: string;
  projectId: string;
  timestamp?: Date;
  isPublic: boolean;
  size?: "icon" | "icon-xs";
}) => {
  const { isBetaEnabled } = useV4Beta();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "objects:publish",
  });
  const utils = api.useUtils();
  const traceQueryInput: RouterInput["traces"]["byIdWithObservationsAndScores"] =
    {
      projectId: props.projectId,
      traceId: props.traceId,
      timestamp: props.timestamp,
    };
  const eventsTraceQueryInput: RouterInput["events"]["byTraceId"] = {
    projectId: props.projectId,
    traceId: props.traceId,
    timestamp: props.timestamp,
  };
  const mut = api.traces.publish.useMutation({
    onMutate: async (input) => {
      if (isBetaEnabled) {
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
                ? { ...observation, public: input.public }
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
        (old) => (old ? { ...old, public: input.public } : old),
      );

      return { previousTrace };
    },
    onError: (err, _input, context) => {
      if (isBetaEnabled) {
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
      trpcErrorToast(err);
    },
    onSuccess: async () => {
      if (!isBetaEnabled) {
        await utils.traces.all.invalidate();
      }
    },
  });

  return (
    <Base
      itemName="trace"
      isPublic={props.isPublic}
      size={props.size}
      onChange={(val) => {
        capture("trace_detail:publish_button_click");
        return mut.mutateAsync({
          projectId: props.projectId,
          traceId: props.traceId,
          public: val,
        });
      }}
      isLoading={mut.isPending}
      disabled={!hasAccess}
    />
  );
};

export const PublishSessionSwitch = (props: {
  sessionId: string;
  projectId: string;
  isPublic: boolean;
  size?: "icon" | "icon-xs";
}) => {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "objects:publish",
  });
  const utils = api.useUtils();
  const mut = api.sessions.publish.useMutation({
    onError: (err) => {
      trpcErrorToast(err);
    },
    onSuccess: async () => {
      await utils.sessions.invalidate();
    },
  });

  return (
    <Base
      itemName="session"
      isPublic={props.isPublic}
      size={props.size}
      onChange={(val) => {
        capture("session_detail:publish_button_click");
        return mut.mutateAsync({
          projectId: props.projectId,
          sessionId: props.sessionId,
          public: val,
        });
      }}
      isLoading={mut.isPending}
      disabled={!hasAccess}
    />
  );
};

const Base = (props: {
  itemName: string;
  onChange: (value: boolean) => Promise<unknown>;
  isLoading: boolean;
  isPublic: boolean;
  disabled?: boolean;
  size?: "icon" | "icon-xs";
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const copyUrl = () => {
    setIsCopied(true);
    void copyTextToClipboard(window.location.href);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleOnClick = () => {
    if (props.isLoading) return;
    setIsOpen(false);
    void props.onChange(!props.isPublic);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="text-sm font-semibold">
        <Popover
          open={isOpen}
          onOpenChange={(open) => {
            if (!props.isLoading) setIsOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id="publish-trace"
              variant="ghost"
              size={props.size}
              loading={props.isLoading}
              disabled={props.disabled}
            >
              {props.isPublic ? (
                <Globe
                  className="h-4 w-4"
                  fill="#b3d9ff"
                  stroke="#4d94ff"
                  strokeWidth={2}
                />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex flex-col gap-3">
            {props.isPublic ? (
              <>
                <Label className="text-base capitalize">
                  {props.itemName} Shared
                </Label>
                <span className="text-muted-foreground text-sm">
                  This {props.itemName} is public. Anyone with the link can view
                  this {props.itemName}.
                </span>
                <div className="mr-2 flex items-center justify-end gap-2 text-sm">
                  <Button variant="outline" size="sm" onClick={copyUrl}>
                    {isCopied ? (
                      <>
                        <CheckIcon size={12} className="mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Link size={12} className="mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive-secondary"
                    size="sm"
                    loading={props.isLoading}
                    onClick={handleOnClick}
                  >
                    Unshare
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Label className="text-base capitalize">
                  {props.itemName} Private
                </Label>
                <span className="text-muted-foreground text-sm">
                  This {props.itemName} is private. Only authorized project
                  members can view this {props.itemName}.
                </span>
                <div className="mr-2 flex items-center justify-end gap-2 text-sm">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={props.isLoading}
                    onClick={handleOnClick}
                  >
                    Share
                  </Button>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
