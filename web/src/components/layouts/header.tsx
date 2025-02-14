import Link from "next/link";
import DocPopup from "@/src/components/layouts/doc-popup";
import { type Status, StatusBadge } from "./status-badge";
import { cn } from "@/src/utils/tailwind";

export default function Header({
  ...props
}: {
  title: string;
  status?: Status;
  label?: {
    text: string;
    href: string;
  };
  help?: { description: string; href?: string; className?: string };
  actionButtons?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2", props.className)}>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex min-w-0 flex-row justify-center align-middle">
            <h3 className="text-xl font-bold leading-7 sm:tracking-tight">
              {props.title}
            </h3>
            {props.help ? (
              <DocPopup
                description={props.help.description}
                href={props.help.href}
                className={props.help.className}
              />
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
