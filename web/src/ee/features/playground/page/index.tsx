import Header from "@/src/components/layouts/header";
import { ResetPlaygroundButton } from "@/src/ee/features/playground/page/components/ResetPlaygroundButton";
import { SaveToPromptButton } from "@/src/ee/features/playground/page/components/SaveToPromptButton";
import { PlaygroundProvider } from "@/src/ee/features/playground/page/context";
import Playground from "@/src/ee/features/playground/page/playground";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

export default function PlaygroundPage() {
  const isEeAvailable = useIsEeEnabled();
  if (!isEeAvailable) return null;
  return (
    <PlaygroundProvider>
      <div className="flex h-[95vh] flex-col">
        <Header
          title="Playground"
          help={{
            description: "A sandbox to test and iterate your prompts",
            href: "https://langfuse.com/docs/playground",
          }}
          featureBetaURL="https://github.com/orgs/langfuse/discussions/1170"
          actionButtons={
            <>
              <SaveToPromptButton />
              <ResetPlaygroundButton />
            </>
          }
        />
        <div className="flex-1 overflow-auto">
          <Playground />
        </div>
      </div>
    </PlaygroundProvider>
  );
}
