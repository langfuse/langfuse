import { ExternalLink } from "lucide-react";
import { CardContent } from "@/src/components/ui/card";
import { Card } from "@/src/components/ui/card";
import Link from "next/link";

export function SetupDefaultEvalModelCard({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <Card className="mt-2 border-dark-yellow bg-light-yellow">
      <CardContent className="flex flex-col gap-1">
        <p className="mt-2 text-sm font-semibold">
          This evaluator requires a default evaluation model
        </p>
        <p className="text-xs text-muted-foreground">
          Please set up a default evaluation model for your project.
        </p>
        <Link
          href={`/project/${projectId}/evals/default-model`}
          className="mt-2 flex items-center text-sm text-blue-500 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Configure default model <ExternalLink className="ml-1" size={14} />
        </Link>
      </CardContent>
    </Card>
  );
}
