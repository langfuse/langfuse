import { ResetPlaygroundButton } from "@/src/ee/features/playground/page/components/ResetPlaygroundButton";
import { SaveToPromptButton } from "@/src/ee/features/playground/page/components/SaveToPromptButton";
import Page from "@/src/components/layouts/page";
import { PlaygroundProvider } from "@/src/ee/features/playground/page/context";
import Playground from "@/src/ee/features/playground/page/playground";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

export default function PlaygroundPage() {
  const available = useHasEntitlement("playground");
  if (!available) return null;
  return (
    <PlaygroundProvider>
      <Page
        withPadding
        headerProps={{
          title: "Playground",
          help: {
            description: "A sandbox to test and iterate your prompts",
            href: "https://langfuse.com/docs/playground",
          },
          actionButtonsRight: (
            <>
              <SaveToPromptButton />
              <ResetPlaygroundButton />
            </>
          ),
        }}
      >
        <div className="flex-1 overflow-auto">
          <Playground />
        </div>
      </Page>
    </PlaygroundProvider>
  );
}
