import Link from "next/link";
import DocPopup from "@/src/components/layouts/doc-popup";
import { type Status, StatusBadge } from "./status-badge";
import { cn } from "@/src/utils/tailwind";

type HeaderProps = {
  title: string;
  status?: Status;
  label?: {
    text: string;
    href: string;
  };
  help?: { description: string; href?: string; className?: string };
  actionButtons?: React.ReactNode;
  className?: string;
};

export default function Header({ ...props }: HeaderProps) {
  return <BaseHeader {...props} level="h3" />;
}

export function SubHeader({ ...props }: HeaderProps) {
  return <BaseHeader {...props} level="h4" />;
}

export function SubHeaderLabel({ ...props }: HeaderProps) {
  return <BaseHeader {...props} level="h5" />;
}

function HeaderTitle({
  level,
  title,
}: {
  level: "h3" | "h4" | "h5";
  title: string;
}) {
  switch (level) {
    case "h3":
      return <h3 className="text-xl font-bold leading-7">{title}</h3>;
    case "h4":
      return <h4 className="text-lg font-medium leading-6">{title}</h4>;
    case "h5":
      return <h5 className="text-base font-medium leading-6">{title}</h5>;
  }
}

function BaseHeader({ ...props }: HeaderProps & { level: "h3" | "h4" | "h5" }) {
  return (
    <div className={cn(props.className, props.level === "h3" && "mb-2")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex min-w-0 flex-row justify-center align-middle">
            <HeaderTitle title={props.title} level={props.level} />
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
