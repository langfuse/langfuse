import { AlertCircle, Settings } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

interface NoModelConfiguredAlertProps {
  projectId: string;
}

export function NoModelConfiguredAlert({
  projectId,
}: NoModelConfiguredAlertProps) {
  return (
    <div className="p-4">
      <Alert variant="warning">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Model Configured</AlertTitle>
        <AlertDescription>
          To use the playground, you need to configure a model first. Go to{" "}
          <Link
            href={`/project/${projectId}/settings/llm-connections`}
            className="font-bold underline underline-offset-4"
          >
            <Settings className="inline h-3 w-3" /> LLM Connection Settings
          </Link>{" "}
          to add an LLM API key and configure your models.
        </AlertDescription>
      </Alert>
    </div>
  );
}
