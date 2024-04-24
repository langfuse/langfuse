import Header from "@/src/components/layouts/header";
import Playground from "@/src/ee/features/playground/page/playground";
import { PlaygroundProvider } from "@/src/ee/features/playground/page/context";
import { getIsCloudEnvironment } from "@/src/ee/utils/getIsCloudEnvironment";

export default function PlaygroundPage() {
  return getIsCloudEnvironment() ? (
    <div className="flex h-[95vh] flex-col">
      <Header
        title="Playground"
        help={{
          description: "A sandbox to test and iterate your prompts",
          href: "https://langfuse.com/docs/playground",
        }}
        featureBetaURL="https://github.com/orgs/langfuse/discussions/1170"
      />
      <div className="flex-1 overflow-auto">
        <PlaygroundProvider>
          <Playground />
        </PlaygroundProvider>
      </div>
    </div>
  ) : null;
}
