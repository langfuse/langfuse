import { ChevronRight } from "lucide-react";

type V4MigrationBadgeContentProps = {
  onClick: () => void;
  title: string;
  description: string;
};

export function V4MigrationBadgeContent({
  onClick,
  title,
  description,
}: V4MigrationBadgeContentProps) {
  return (
    <span className="inline-grid flex-none shrink-0">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold whitespace-nowrap"
      >
        <span className="size-1.75 shrink-0 rounded-full" />
        <span className="flex items-center">
          {title}.&nbsp;{description}.
          <ChevronRight className="ml-1 h-3 w-3 shrink-0" />
        </span>
      </span>

      <button
        type="button"
        onClick={onClick}
        className="group ring-input hover:bg-muted/50 hover:text-secondary col-start-1 row-start-1 inline-flex w-fit flex-none shrink-0 items-center gap-1.5 justify-self-start rounded-full bg-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap ring"
      >
        <span
          aria-hidden
          className="size-1.75 shrink-0 rounded-full bg-orange-400 dark:bg-orange-400"
        />
        <span className="flex items-center">
          {title}
          <span className="flex max-w-0 items-center overflow-hidden transition-[max-width] duration-300 ease-out group-hover:max-w-96 group-focus-visible:max-w-96">
            <span className="whitespace-nowrap">.&nbsp;{description}.</span>
          </span>
          <ChevronRight className="ml-1 h-3 w-3 shrink-0" />
        </span>
      </button>
    </span>
  );
}
