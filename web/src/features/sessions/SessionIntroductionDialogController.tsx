import { type ReactNode, useEffect, useRef, useState } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SessionIntroductionDialogContent } from "@/src/features/sessions/SessionIntroductionDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export const SESSION_INTRODUCTION_STORAGE_KEY =
  "session-transcripts-introduction-v1-dismissed";
export const SESSION_INTRODUCTION_ACKNOWLEDGED_STORAGE_KEY =
  "session-transcripts-introduction-v1-acknowledged";

export function SessionIntroductionDialogController({
  initialState,
  onDismiss,
  children,
}: {
  initialState: "first-visit" | "dismissed" | "acknowledged";
  onDismiss: (state: "dismissed" | "acknowledged") => void;
  children: (control: {
    hasDismissed: boolean;
    showBadge: boolean;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const hasTrackedFirstVisit = useRef(false);
  const source = useRef<"first_visit" | "reopen">("first_visit");
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (state === "first-visit" && !hasTrackedFirstVisit.current) {
      hasTrackedFirstVisit.current = true;
      capture("session_introduction:shown", { source: "first_visit" });
    }
  }, [state, capture]);

  return (
    <DialogController<"first_visit" | "reopen">
      initialState={() => (state === "first-visit" ? "first_visit" : undefined)}
      onDismiss={() => {
        const nextState =
          source.current === "reopen" ? "acknowledged" : "dismissed";
        try {
          localStorage.setItem(SESSION_INTRODUCTION_STORAGE_KEY, "true");
          if (nextState === "acknowledged") {
            localStorage.setItem(
              SESSION_INTRODUCTION_ACKNOWLEDGED_STORAGE_KEY,
              "true",
            );
          }
        } catch {
          // Storage may be unavailable; dismissal still applies to this visit.
        }
        capture("session_introduction:dismissed", {
          source: source.current,
        });
        setState(nextState);
        onDismiss(nextState);
      }}
      renderDialog={() => (
        <SessionIntroductionDialogContent
          onAfterButtonClick={(button) =>
            capture("session_introduction:button_clicked", { button })
          }
        />
      )}
    >
      {({ openDialog }) =>
        children({
          hasDismissed: state !== "first-visit",
          showBadge: state === "dismissed",
          openDialog: () => {
            source.current = "reopen";
            capture("session_introduction:button_clicked", {
              button: "reopen",
            });
            openDialog("reopen");
            capture("session_introduction:shown", { source: "reopen" });
          },
        })
      }
    </DialogController>
  );
}
