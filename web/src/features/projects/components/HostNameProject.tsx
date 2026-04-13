import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";

const getServerOrigin = () => {
  const origin = env.NEXTAUTH_URL?.replace("/api/auth", "") ?? "";
  return origin && !/^https?:\/\//.test(origin) ? `https://${origin}` : origin;
};

export function HostNameProject() {
  const uiCustomization = useUiCustomization();
  const baseUrl = `${
    uiCustomization?.hostname ??
    (typeof window !== "undefined" ? window.origin : getServerOrigin())
  }${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;

  return (
    <div>
      <Header title="Host Name" />
      <Card className="mb-4 p-3">
        <div className="">
          <div className="mb-2 text-sm">
            When connecting to Langfuse, use this hostname / baseurl.
          </div>
          <CodeView content={baseUrl} />
        </div>
      </Card>
    </div>
  );
}
