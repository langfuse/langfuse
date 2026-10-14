import { CalendarDays } from "lucide-react";
import { SidebarMenuButton } from "@/src/app/design-system/legacy-primitives/sidebar";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";

export const BookACallButton = () => {
  const capture = usePostHogClientCapture();

  return (
    <SidebarMenuButton asChild>
      <Link
        href="https://cal.com/team/langfuse/welcome-to-langfuse"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          capture("sidebar:book_a_call_clicked");
        }}
      >
        <CalendarDays className="icon-base" />
        Book a call
      </Link>
    </SidebarMenuButton>
  );
};
