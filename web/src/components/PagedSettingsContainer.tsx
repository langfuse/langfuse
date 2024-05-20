import { cn } from "@/src/utils/tailwind";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";

type SettingsProps = {
  pages: Array<
    {
      title: string;
      show?: boolean | (() => boolean);
    } & ({ content: ReactNode } | { href: string })
  >;
};

export const PagedSettingsContainer = ({ pages }: SettingsProps) => {
  const availablePages = pages.filter((page) =>
    "show" in page
      ? typeof page.show === "function"
        ? page.show()
        : page.show
      : true,
  );
  const [currentPageTitle, setCurrentPageTitle] = useQueryParam(
    "page",
    withDefault(StringParam, availablePages[0].title),
  );
  const currentPage = availablePages.find(
    (page) => page.title === currentPageTitle,
  );
  return (
    <main className="flex flex-1 flex-col gap-4 py-4 md:gap-8">
      <div className="grid w-full items-start gap-4 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
        <nav
          className="grid gap-4 text-sm text-muted-foreground"
          x-chunk="dashboard-04-chunk-0"
        >
          {availablePages.map((page) =>
            "href" in page ? (
              <Link
                key={page.title}
                href={page.href}
                className="flex flex-row items-center gap-2 font-semibold"
              >
                {page.title}
                <ArrowUpRight size={14} className="inline" />
              </Link>
            ) : (
              <span
                key={page.title}
                onClick={() => setCurrentPageTitle(page.title)}
                className={cn(
                  "cursor-pointer font-semibold",
                  page.title === currentPageTitle && "text-primary",
                )}
              >
                {page.title}
              </span>
            ),
          )}
        </nav>
        <div className="w-full overflow-hidden p-1">
          {currentPage && "content" in currentPage ? currentPage.content : null}
        </div>
      </div>
    </main>
  );
};
