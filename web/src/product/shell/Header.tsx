import { cn } from "@/src/utils/tailwind";
import { type ShellBreadcrumbItem, ShellBreadcrumbs } from "./Breadcrumbs";

type ProductHeaderProps = {
  breadcrumbs: ShellBreadcrumbItem[];
  className?: string;
};

export function ProductHeader({ breadcrumbs, className }: ProductHeaderProps) {
  return (
    <header
      className={cn(
        "top-banner-offset bg-background sticky z-30 w-full border-b",
        className,
      )}
    >
      <div className="flex min-h-11 items-center px-3 py-2">
        <ShellBreadcrumbs items={breadcrumbs} />
      </div>
    </header>
  );
}
