import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";

export function HostNameProject() {
  const uiCustomization = useUiCustomization();
  return (
    <div>
      <Header title="Host Name" level="h3" />
      <Card className="mb-4 p-4">
        <div className="">
          <div className="mb-2 text-sm">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeView content={uiCustomization?.hostname ?? window.origin} />
        </div>
      </Card>
    </div>
  );
}
