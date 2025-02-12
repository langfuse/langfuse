import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { Globe, Share2, CheckIcon } from "lucide-react";
import { useState } from "react";

export const PublishTraceSwitch = (props: {
  traceId: string;
  projectId: string;
  isPublic: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "objects:publish",
  });
  const utils = api.useUtils();
  const mut = api.traces.publish.useMutation({
    onSuccess: () => utils.traces.invalidate(),
  });

  return (
    <Base
      id={props.traceId}
      isPublic={props.isPublic}
      onChange={(val) => {
        mut.mutate({
          projectId: props.projectId,
          traceId: props.traceId,
          public: val,
        });
        capture("trace_detail:publish_button_click");
      }}
      isLoading={mut.isLoading}
      disabled={!hasAccess}
    />
  );
};

export const PublishSessionSwitch = (props: {
  sessionId: string;
  projectId: string;
  isPublic: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "objects:publish",
  });
  const utils = api.useUtils();
  const mut = api.sessions.publish.useMutation({
    onSuccess: () => utils.sessions.invalidate(),
  });

  return (
    <Base
      id={props.sessionId}
      isPublic={props.isPublic}
      onChange={(val) => {
        mut.mutate({
          projectId: props.projectId,
          sessionId: props.sessionId,
          public: val,
        });
        capture("session_detail:publish_button_click");
      }}
      isLoading={mut.isLoading}
      disabled={!hasAccess}
    />
  );
};

const Base = (props: {
  id: string;
  onChange: (value: boolean) => void;
  isLoading: boolean;
  isPublic: boolean;
  disabled?: boolean;
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyUrl = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(window.location.href);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="text-sm font-semibold">
        <Button
          id="publish-trace"
          variant="ghost"
          size="icon"
          title={props.isPublic ? "Mark as private" : "Mark as public"}
          loading={props.isLoading}
          disabled={props.disabled}
          onClick={() => {
            if (props.isLoading) return;
            if (!props.isPublic) copyUrl();
            props.onChange(!props.isPublic);
          }}
        >
          {props.isPublic ? (
            <Globe className="h-4 w-4" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      {props.isPublic && (
        <div
          className="flex cursor-pointer items-center gap-1"
          onClick={() => copyUrl()}
          title="Copy link"
        >
          <StatusBadge type="public" isLive={false} />
        </div>
      )}
      {isCopied && (
        <div className="flex items-center gap-1 text-xs">
          <CheckIcon className="h-3 w-3" />
          <span>Link copied</span>
        </div>
      )}
    </div>
  );
};
