import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { AlertCircle } from "lucide-react";

type NoMatchDisplayProps = {
  modelName: string;
};

export type { NoMatchDisplayProps };

export function NoMatchDisplay({ modelName }: NoMatchDisplayProps) {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertCircle className="h-5 w-5" />
          No Match Found
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          No model configuration matches &quot;{modelName}&quot; in this
          project.
        </p>

        <div>
          <p className="mb-2 text-sm font-medium">Suggestions:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Check your model name spelling</li>
            <li>View existing models and their match patterns</li>
            <li>Create a new model definition</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
