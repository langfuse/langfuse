import { Switch } from "@/src/components/ui/switch";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { Link, LockIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";

export const PublishTraceSwitch = (props: {
  traceId: string;
  projectId: string;
  isPublic: boolean;
}) => {
  const posthog = usePostHog();
  const hasAccess = useHasAccess({
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
        posthog.capture("trace_detail:publish_button_click");
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
  const posthog = usePostHog();
  const hasAccess = useHasAccess({
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
        posthog.capture("session_detail:publish_button_click");
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
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm font-semibold">
        {props.isLoading ? (
          "Loading.."
        ) : props.isPublic ? (
          <div
            className="flex cursor-pointer items-center gap-1 text-green-800"
            onClick={() => copyUrl()}
          >
            {isCopied ? "Link copied ..." : "Public"}
            <Link size={16} />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            Private
            <LockIcon size={16} />
          </div>
        )}
      </div>
      <Switch
        id="publish-trace"
        checked={props.isPublic}
        onCheckedChange={() => {
          if (props.isLoading) return;
          props.onChange(!props.isPublic);
        }}
        disabled={props.disabled}
      />
    </div>
  );
};
