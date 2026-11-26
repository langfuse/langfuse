import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type ModelScope } from "@langfuse/shared";
import { modelMaintainerByScope } from "@/src/features/models/modelMaintainer";

export type MatchedModelCardProps = {
  model: {
    modelName: string;
    matchPattern: string;
    scope: ModelScope;
  };
};

export function MatchedModelCard({ model }: MatchedModelCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          Matched Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold">
            {model.modelName}
          </span>
          {model.scope !== "PROJECT" && (
            <Badge color="filled" text={modelMaintainerByScope[model.scope]} />
          )}
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground text-xs font-bold">
            Pattern:
          </div>
          <code className="bg-muted/50 block rounded p-2 text-xs break-all">
            {model.matchPattern}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
