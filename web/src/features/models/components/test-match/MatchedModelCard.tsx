import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";

type MatchedModelCardProps = {
  projectId: string;
  model: {
    id: string;
    modelName: string;
    matchPattern: string;
    projectId: string | null;
  };
  pricingTierId: string;
};

export type { MatchedModelCardProps };

export function MatchedModelCard({ model }: MatchedModelCardProps) {
  const isLangfuseModel = !model.projectId;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Matched Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold">
            {model.modelName}
          </span>
          {isLangfuseModel && (
            <Badge variant="secondary" className="text-xs">
              Langfuse
            </Badge>
          )}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            Pattern:
          </div>
          <code className="block break-all rounded bg-muted/50 p-2 text-xs">
            {model.matchPattern}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
