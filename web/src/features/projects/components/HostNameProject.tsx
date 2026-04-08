import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { getAppBaseUrl } from "@/src/utils/app-base-url";

export function HostNameProject() {
  const uiCustomization = useUiCustomization();
  return (
    <div>
      <Header title="Host Name" />
      <Card className="mb-4 p-3">
        <div className="">
          <div className="mb-2 text-sm">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeView content={getAppBaseUrl(uiCustomization?.hostname)} />
        </div>
      </Card>
    </div>
  );
}
