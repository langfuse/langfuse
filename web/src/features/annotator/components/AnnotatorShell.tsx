import { LangfuseLogo } from "@/src/components/design-system/LangfuseLogo/LangfuseLogo";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import {
  CircleHelp,
  LayoutDashboard,
  ListChecks,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

type AnnotatorShellProps = {
  projectId: string;
  children: ReactNode;
  mode?: "annotator" | "studio";
  compact?: boolean;
};

const navItems = [
  { label: "My work", suffix: "", icon: ListChecks },
  { label: "Help", suffix: "?panel=help", icon: CircleHelp },
] as const;

export function AnnotatorShell({
  projectId,
  children,
  mode = "annotator",
  compact = false,
}: AnnotatorShellProps) {
  const router = useRouter();
  const rootHref = `/project/${projectId}/annotator`;

  return (
    <div className="bg-muted/20 text-foreground flex h-dvh min-h-0 flex-col">
      <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link href={rootHref} className="flex items-center gap-3">
            <LangfuseLogo />
            <span className="text-foreground-tertiary hidden h-5 border-l pl-3 text-sm md:inline">
              Annotate
            </span>
          </Link>
          {!compact && mode === "annotator" ? (
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.label}
                    asChild
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "gap-1.5",
                      item.label === "My work" &&
                        router.pathname.endsWith("/annotator") &&
                        "bg-accent",
                    )}
                  >
                    <Link href={`${rootHref}${item.suffix}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {mode === "studio" ? (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={rootHref}>
                <ListChecks className="h-3.5 w-3.5" />
                Annotator view
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href={`${rootHref}/studio`}>
                <Settings2 className="h-3.5 w-3.5" />
                Studio
              </Link>
            </Button>
          )}
          {!compact ? (
            <Button asChild variant="ghost" size="icon-sm">
              <Link
                href={`/project/${projectId}`}
                aria-label="Return to Langfuse"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
