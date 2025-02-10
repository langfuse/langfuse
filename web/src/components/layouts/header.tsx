import Link from "next/link";
import DocPopup from "@/src/components/layouts/doc-popup";
import { type Status, StatusBadge } from "./status-badge";
import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import { EnvLabel } from "@/src/components/EnvLabel";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";

export default function Header({
  level = "h2",
  ...props
}: {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  status?: Status;
  label?: {
    text: string;
    href: string;
  };
  help?: { description: string; href?: string; className?: string };
  featureBetaURL?: string;
  actionButtons?: React.ReactNode;
  level?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        level === "h2"
          ? "sticky top-0 z-20 mb-2 border-b bg-background p-3"
          : "mb-2",
        props.className,
      )}
    >
      {level === "h2" && (
        <div className="flex items-center">
          <SidebarTrigger />
          <div className="ml-3">
            <EnvLabel />
          </div>
          <BreadcrumbComponent
            items={props.breadcrumb}
            className="ml-3 border-l pl-3"
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex min-w-0 flex-row justify-center align-middle">
            {level === "h2" ? (
              <h2 className="text-3xl font-bold leading-7 sm:tracking-tight">
                {props.title}
              </h2>
            ) : (
              <h3 className="text-xl font-bold leading-7 sm:tracking-tight">
                {props.title}
              </h3>
            )}
            {props.help ? (
              <DocPopup
                description={props.help.description}
                href={props.help.href}
                className={props.help.className}
              />
            ) : null}
            {props.featureBetaURL ? (
              <Link
                href={props.featureBetaURL}
                rel="noopener noreferrer"
                target="_blank"
                className="flex items-center"
              >
                <Badge
                  title="Feature is currently in beta. Click to learn more."
                  className="ml-2"
                >
                  Beta
                </Badge>
              </Link>
            ) : null}
          </div>
          {props.status && <StatusBadge type={props.status} />}
          {props.label && (
            <Link href={props.label.href}>
              <StatusBadge type={props.label.text} />
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {props.actionButtons ?? null}
        </div>
      </div>
    </div>
  );
}
