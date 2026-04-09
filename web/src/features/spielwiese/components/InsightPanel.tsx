import { ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import type { SpielwieseInsightVM } from "../types/dashboard";

type InsightPanelProps = {
  insights: SpielwieseInsightVM[];
};

export function InsightPanel({ insights }: InsightPanelProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {insights.map((insight) => (
        <Card key={insight.id} className="@container overflow-hidden">
          <CardHeader className="gap-2">
            <p className="text-muted-foreground text-sm font-medium tracking-[0.18em] uppercase">
              {insight.kicker}
            </p>
            <CardTitle className="text-lg">{insight.title}</CardTitle>
            <CardDescription>{insight.summary}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-between">
            <span className="text-muted-foreground text-sm">
              Context stays close to the work.
            </span>
            <Button size="sm" variant="ghost">
              {insight.cta}
              <ArrowRight data-icon="inline-end" size={16} />
            </Button>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}
