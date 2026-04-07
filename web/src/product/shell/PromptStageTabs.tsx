import Link from "next/link";
import { cn } from "@/src/utils/tailwind";
import { type PromptStage } from "./product-manifest";
import { type LucideIcon } from "lucide-react";

export type PromptStageTab = {
  value: PromptStage;
  label: string;
  href: string;
  icon: LucideIcon;
};

export function PromptStageTabs({
  activeStage,
  tabs,
}: {
  activeStage: PromptStage;
  tabs: PromptStageTab[];
}) {
  return (
    <div className="bg-muted/60 inline-flex h-7 w-fit items-center justify-center rounded-md px-[3px] py-[2px]">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          className={cn(
            "inline-flex h-[calc(100%-2px)] items-center justify-center gap-1 rounded border border-transparent px-2.5 py-0 text-sm font-bold whitespace-nowrap",
            tab.value === activeStage
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          <tab.icon className="size-3" />
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
