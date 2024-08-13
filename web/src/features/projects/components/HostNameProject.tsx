import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";

export function HostNameProject() {
  return (
    <div>
      <Header title="Host Name" level="h3" />
      <Card className="mb-4 p-4">
        <div className="">
          <div className="mb-2 text-sm">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeView content={window.origin} />
        </div>
      </Card>
    </div>
  );
}
