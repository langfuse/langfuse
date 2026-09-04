import { AlertCircle, Settings } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/src/components/design-system/Alert/Alert";

interface NoModelConfiguredAlertProps {
  projectId: string;
}

export function NoModelConfiguredAlert({
  projectId,
}: NoModelConfiguredAlertProps) {
  return (
    <div className="p-4">
      <Alert variant="warning" icon={AlertCircle}>
        <Alert.Title>No Model Configured</Alert.Title>
        <Alert.Description>
          To use the playground, you need to configure a model first. Go to{" "}
          <Link
            href={`/project/${projectId}/settings/llm-connections`}
            className="font-bold underline underline-offset-4 hover:text-yellow-900 dark:hover:text-yellow-300"
          >
            <Settings className="inline h-3 w-3" /> LLM Connection Settings
          </Link>{" "}
          to add an LLM API key and configure your models.
        </Alert.Description>
      </Alert>
    </div>
  );
}
