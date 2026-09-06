import { CalendarDays } from "lucide-react";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useTranslations } from "next-intl";

export const BookACallButton = () => {
  const t = useTranslations("navigation.items");
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
        <CalendarDays className="h-4 w-4" />
        {t("bookACall")}
      </Link>
    </SidebarMenuButton>
  );
};
