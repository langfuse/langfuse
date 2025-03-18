import { cn } from "@/src/utils/tailwind";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useRouter } from "next/router";

type SettingsProps = {
  pages: Array<
    {
      title: string;
      slug: string;
      show?: boolean | (() => boolean);
    } & ({ content: ReactNode } | { href: string })
  >;
  activeSlug?: string;
};

export const PagedSettingsContainer = ({
  pages,
  activeSlug,
}: SettingsProps) => {
  const router = useRouter();
  const availablePages = pages.filter((page) =>
    "show" in page
      ? typeof page.show === "function"
        ? page.show()
        : page.show
      : true,
  );

  const currentPage =
    availablePages.find((page) => page.slug === activeSlug) ??
    availablePages[0]; // Fallback to first page if not found

  const onChange = (newSlug: string) => {
    const pathSegments = router.asPath.split("/");
    if (pathSegments[pathSegments.length - 1] !== "settings")
      pathSegments.pop();
    if (newSlug !== "index") pathSegments.push(newSlug);
    router.push(pathSegments.join("/"));
  };

  return (
    <main className="flex flex-1 flex-col gap-4 py-4 md:gap-8">
      <div className="grid w-full items-start gap-4 md:grid-cols-[150px_1fr] lg:grid-cols-[220px_1fr]">
        <nav className="block md:hidden">
          <Select
            onValueChange={(slug) => {
              const page = availablePages.find((p) => p.slug === slug);
              if (page && "href" in page) router.push(page.href);
              else onChange(slug);
            }}
            value={currentPage.slug}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a page" />
            </SelectTrigger>
            <SelectContent>
              {availablePages.map((page) => (
                <SelectItem key={page.title} value={page.slug}>
                  {page.title}
                  {"href" in page && (
                    <ArrowUpRight size={14} className="ml-1 inline" />
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </nav>
        <nav
          className="hidden gap-4 text-sm text-muted-foreground md:sticky md:top-5 md:grid"
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
                onClick={() => onChange(page.slug)}
                className={cn(
                  "cursor-pointer font-semibold",
                  page.slug === currentPage.slug && "text-primary",
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
