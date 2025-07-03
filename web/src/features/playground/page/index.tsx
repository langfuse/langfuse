import { ResetPlaygroundButton } from "@/src/features/playground/page/components/ResetPlaygroundButton";
import { SaveToPromptButton } from "@/src/features/playground/page/components/SaveToPromptButton";
import Page from "@/src/components/layouts/page";
import { MultiPlaygroundProvider } from "@/src/features/playground/page/context/multi-playground-context";
import { MultiPlayground } from "@/src/features/playground/page/components/multi-column/MultiPlayground";

export default function PlaygroundPage() {
  return (
    <MultiPlaygroundProvider>
      <Page
        withPadding={false} // Remove padding for full-width multi-column layout
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
        <div className="flex-1 overflow-hidden">
          <MultiPlayground />
        </div>
      </Page>
    </MultiPlaygroundProvider>
  );
}
