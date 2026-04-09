import { Button } from "../ui/button";
import type { SpielwieseDashboardVM } from "../types/dashboard";

type DashboardHeroProps = {
  header: SpielwieseDashboardVM["header"];
};

export function DashboardHero({ header }: DashboardHeroProps) {
  return (
    <section className="border-border/60 bg-card/80 overflow-hidden rounded-[1.75rem] border p-6 shadow-sm backdrop-blur-sm">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm font-medium tracking-[0.22em] uppercase">
            {header.eyebrow}
          </p>
          <div className="flex flex-col gap-3">
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {header.title}
            </h2>
            <p className="text-muted-foreground max-w-2xl text-base">
              {header.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="sm">Review lanes</Button>
            <Button size="sm" variant="ghost">
              Open notes
            </Button>
          </div>
        </div>
        <div className="grid gap-3 self-start">
          <div className="border-border/70 bg-background/70 rounded-[1.25rem] border p-4">
            <p className="text-muted-foreground text-sm">Default preset</p>
            <p className="text-xl font-semibold">`b1D0eCA7`</p>
          </div>
          <div className="border-border/70 bg-background/70 rounded-[1.25rem] border p-4">
            <p className="text-muted-foreground text-sm">Current focus</p>
            <p className="text-xl font-semibold">Shell first</p>
          </div>
        </div>
      </div>
    </section>
  );
}
