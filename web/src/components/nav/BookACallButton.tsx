import { CalendarDays } from "@langfuse/icons";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export const BookACallButton = () => {
  const capture = usePostHogClientCapture();

  return (
    <SidebarNavItem
      href="https://cal.com/team/langfuse/welcome-to-langfuse"
      isActive={false}
      opensInNewTab
      leading={<CalendarDays size="base" />}
      label="Book a call"
      onClick={() => {
        capture("sidebar:book_a_call_clicked");
      }}
    />
  );
};
