import { Switch } from "@/src/components/ui/switch";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { Link, Lock } from "lucide-react";
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
    scope: "traces:publish",
  });
  const utils = api.useContext();
  const mut = api.publishTraces.update.useMutation({
    onSuccess: () => utils.traces.invalidate(),
  });

  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (text: string) => {
    setIsCopied(true);
    void navigator.clipboard.writeText(text);
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm font-semibold">
        {mut.isLoading ? (
          "Loading.."
        ) : props.isPublic ? (
          <div
            className="flex cursor-pointer items-center gap-1 text-green-800"
            onClick={() =>
              handleCopy(
                window.location.origin + "/public/traces/" + props.traceId,
              )
            }
          >
            {isCopied ? "Link copied ..." : "Public"}
            <Link size={16} />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            Private
            <Lock size={16} />
          </div>
        )}
      </div>
      <Switch
        id="publish-trace"
        checked={props.isPublic}
        onCheckedChange={() => {
          if (mut.isLoading) return;
          mut.mutate({
            traceId: props.traceId,
            public: !props.isPublic,
            projectId: props.projectId,
          });
          posthog.capture("trace_detail:publish_trace_button_click");
        }}
        disabled={!hasAccess}
      />
    </div>
  );
};
