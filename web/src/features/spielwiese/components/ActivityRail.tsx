import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import type { SpielwieseDashboardVM } from "../types/dashboard";

type ActivityRailProps = {
  activity: SpielwieseDashboardVM["activity"];
};

export function ActivityRail({ activity }: ActivityRailProps) {
  return (
    <section
      className="@container flex flex-col gap-4"
      data-testid="spielwiese-activity-rail"
    >
      <Card className="overflow-hidden">
        <CardHeader className="gap-2">
          <CardTitle>{activity.title}</CardTitle>
          <CardDescription>{activity.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {activity.items.map((item) => (
            <article
              key={item.id}
              className="border-border/60 bg-background/70 flex items-start justify-between gap-3 rounded-2xl border p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="text-muted-foreground text-sm">{item.detail}</p>
              </div>
              <span className="text-muted-foreground text-sm font-medium tabular-nums">
                {item.value}
              </span>
            </article>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
