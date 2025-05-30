import { ResetPlaygroundButton } from "@/src/features/playground/page/components/ResetPlaygroundButton";
import { SaveToPromptButton } from "@/src/features/playground/page/components/SaveToPromptButton";
import Page from "@/src/components/layouts/page";
import { PlaygroundProvider } from "@/src/features/playground/page/context";
import Playground from "@/src/features/playground/page/playground";

export default function PlaygroundPage() {
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
