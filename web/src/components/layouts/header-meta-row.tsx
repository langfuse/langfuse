import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";

import { HeaderPill } from "@/src/components/layouts/header-pill";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

export type HeaderMetaItem = {
  key: string;
  searchText: string;
  content: ReactNode;
};

export function HeaderMetaRow({
  items,
  noun,
  trailingContent,
}: {
  items: readonly HeaderMetaItem[];
  noun: string;
  trailingContent?: ReactNode;
}) {
  const [search, setSearch] = useState("");

  return (
    <div className="bg-header border-b px-4 py-2">
      <SingleLineOverflowList
        items={items}
        additionalOverflowCount={0}
        getKey={(item) => item.key}
        renderItem={(item) => item.content}
        trailingContent={trailingContent}
        renderOverflow={({ hiddenItems, overflowItemCount }) => {
          const normalizedSearch = search.trim().toLocaleLowerCase();
          const filteredItems = normalizedSearch
            ? hiddenItems.filter((item) =>
                item.searchText.toLocaleLowerCase().includes(normalizedSearch),
              )
            : hiddenItems;

          return (
            <Popover
              onOpenChange={(open) => {
                if (open) return;
                setSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <HeaderPill
                  variant="button"
                  ariaLabel={`Show ${overflowItemCount} hidden ${noun}`}
                >
                  +{overflowItemCount}
                </HeaderPill>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-0"
                aria-label={`All ${noun}`}
              >
                <div className="relative border-b p-2">
                  <Search className="text-muted-foreground absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search ${noun}`}
                    aria-label={`Search ${noun}`}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div
                  role="region"
                  aria-label={`${noun} results`}
                  className="flex max-h-72 flex-col items-start gap-2 overflow-y-auto p-2"
                >
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item) => (
                      <div key={item.key}>{item.content}</div>
                    ))
                  ) : (
                    <p className="text-muted-foreground px-2 py-4 text-xs">
                      No {noun} found.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        }}
      />
    </div>
  );
}
