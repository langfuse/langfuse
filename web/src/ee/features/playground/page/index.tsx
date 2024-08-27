import Header from "@/src/components/layouts/header";
import { ResetPlaygroundButton } from "@/src/ee/features/playground/page/components/ResetPlaygroundButton";
import { SaveToPromptButton } from "@/src/ee/features/playground/page/components/SaveToPromptButton";
import { PlaygroundProvider } from "@/src/ee/features/playground/page/context";
import Playground from "@/src/ee/features/playground/page/playground";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";

export default function PlaygroundPage() {
  const available = useHasOrgEntitlement("playground");
  if (!available) return null;
  return (
    <PlaygroundProvider>
      <div className="flex h-[95vh] flex-col">
        <Header
          title="Playground"
          help={{
            description: "A sandbox to test and iterate your prompts",
            href: "https://langfuse.com/docs/playground",
          }}
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
