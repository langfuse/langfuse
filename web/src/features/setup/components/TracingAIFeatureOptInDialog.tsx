import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

const AI_FEATURES_DOCS_URL = "https://langfuse.com/security/ai-features";
const DEBUG_LOG_ENDPOINT = "/api/internal/tracing-ai-opt-in-debug-log";

const emitDebugLog = (
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  fetch(DEBUG_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
};

export function TracingAIFeatureOptInDialog({
  open,
  isLoading,
  hasOrganizationUpdateAccess,
  organizationId,
  onClose,
  onEnableAiFeatures,
}: {
  open: boolean;
  isLoading: boolean;
  hasOrganizationUpdateAccess: boolean;
  organizationId?: string;
  onClose: () => void;
  onEnableAiFeatures: () => void;
}) {
  useEffect(() => {
    // #region agent log
    emitDebugLog(
      "E",
      "TracingAIFeatureOptInDialog.tsx:useEffect:openProp",
      "Dialog received open prop update",
      { open, isLoading, hasOrganizationUpdateAccess, organizationId },
    );
    // #endregion
  }, [hasOrganizationUpdateAccess, isLoading, open, organizationId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // #region agent log
        emitDebugLog(
          "A",
          "TracingAIFeatureOptInDialog.tsx:onOpenChange",
          "Dialog open state changed",
          { isOpen, isLoading, open },
        );
        // #endregion
        if (!isOpen && !isLoading) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable AI features for your organization?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Enable AI features to use the in-app assistant and other
              AI-powered capabilities while onboarding tracing.
            </p>
            <p className="text-muted-foreground">
              When enabled, any data <i>can</i> be sent to AWS Bedrock within
              your Langfuse data region. Your data will not be used for model
              training, and applicable HIPAA, SOC2, GDPR, and ISO 27001
              compliance remains intact.
            </p>
            <a
              href={AI_FEATURES_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              Learn more in the docs.
              <ExternalLink className="h-3 w-3" />
            </a>

            {!hasOrganizationUpdateAccess ? (
              <p className="text-muted-foreground">
                Only organization admins can enable AI features.
                {organizationId ? (
                  <>
                    {" "}
                    Ask an admin to enable this in{" "}
                    <a
                      href={`/organization/${organizationId}/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Organization Settings
                    </a>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => {
                // #region agent log
                emitDebugLog(
                  "A",
                  "TracingAIFeatureOptInDialog.tsx:notNowButton",
                  "Not now button clicked",
                  { isLoading, open },
                );
                // #endregion
                onClose();
              }}
            >
              Not now
            </Button>
            {hasOrganizationUpdateAccess ? (
              <Button
                type="button"
                onClick={onEnableAiFeatures}
                loading={isLoading}
              >
                Enable AI features
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
