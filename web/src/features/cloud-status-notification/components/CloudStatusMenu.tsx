import Link from "next/link";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useTranslations } from "next-intl";

export function CloudStatusMenu() {
  const t = useTranslations("systemUi.miscUi.general");
  return (
    <SidebarMenuButton asChild tooltip={t("activeIncident")}>
      <Link
        href="https://status.langfuse.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="relative mx-1 flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="bg-destructive inline-flex h-2 w-2 rounded-full" />
        </div>
        {t("activeIncident")}
      </Link>
    </SidebarMenuButton>
  );
}
