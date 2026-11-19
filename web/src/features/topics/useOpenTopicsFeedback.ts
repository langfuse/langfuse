import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

/** Opens the support form as Topics feedback, so it reaches support tagged for the team. */
export function useOpenTopicsFeedback() {
  const { openWithMode } = useSupportDrawer();
  const capture = usePostHogClientCapture();
  return () => {
    capture("topics:feedback_open");
    openWithMode("form", {
      messageType: "Feedback",
      topic: "Observability",
      message: "Topics: ",
    });
  };
}
