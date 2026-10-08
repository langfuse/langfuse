import { Card } from "@/src/components/ui/card";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import Header from "@/src/components/layouts/header";
import { useUiCustomization } from "@/src/ee/features/ui-customization";
import { env } from "@/src/env.mjs";

export function HostNameProject() {
  const uiCustomization = useUiCustomization();
  const hostName = `${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
  return (
    <div>
      <Header title="Host Name" />
      <Card className="mb-4 p-3">
        <div className="">
          <div className="mb-2 text-sm">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeSection variant="outline" copyValue={hostName}>
            {hostName}
          </CodeSection>
        </div>
      </Card>
    </div>
  );
}
