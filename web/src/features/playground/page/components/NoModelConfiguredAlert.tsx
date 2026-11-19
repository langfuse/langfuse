import { Settings } from "@langfuse/icons";
import { Banner } from "@/src/components/design-system/Banner/Banner";

interface NoModelConfiguredAlertProps {
  projectId: string;
}

export function NoModelConfiguredAlert({
  projectId,
}: NoModelConfiguredAlertProps) {
  return (
    <div className="px-4 pt-4">
      <Banner
        variant="warning"
        title="No LLM connection configured"
        actions={[
          {
            text: "LLM connection settings",
            href: `/project/${projectId}/settings/llm-connections`,
            icon: Settings,
          },
        ]}
      >
        To use the playground, you need to configure a model first. Go to LLM
        Connection Settings to add an LLM API key and configure your models.
      </Banner>
    </div>
  );
}
