import { type SidebarNotificationState } from "@/src/components/nav/SidebarNotifications";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

const DISMISSED_SIDEBAR_NOTIFICATIONS_KEY = "dismissed-sidebar-notifications";
const NO_DISMISSED_IDS: string[] = [];

/** Dismissal state for the sidebar announcement cards, persisted per browser. */
export function useSidebarNotificationState(): SidebarNotificationState {
  const capture = usePostHogClientCapture();
  const [dismissedIds, setDismissedIds] = useLocalStorage<string[]>(
    DISMISSED_SIDEBAR_NOTIFICATIONS_KEY,
    NO_DISMISSED_IDS,
  );

  return {
    dismissedIds,
    onDismiss: (id) => {
      capture("notification:dismiss_notification", { notification_id: id });
      setDismissedIds((current) => [...current, id]);
    },
    onLinkClick: (id) => {
      capture("notification:click_link", { notification_id: id });
    },
  };
}
