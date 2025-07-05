import { useState } from "react";
import { ResetPlaygroundButton } from "@/src/features/playground/page/components/ResetPlaygroundButton";
import { SaveToPromptButton } from "@/src/features/playground/page/components/SaveToPromptButton";
import Page from "@/src/components/layouts/page";
import { PlaygroundProvider } from "@/src/features/playground/page/context";
import { MultiPlaygroundProvider } from "@/src/features/playground/page/context/multi-playground-context";
import Playground from "@/src/features/playground/page/playground";
import { MultiPlayground } from "@/src/features/playground/page/multi-playground";
import { Button } from "@/src/components/ui/button";
import { ColumnsIcon, SquareIcon } from "lucide-react";
import { useRouter } from "next/router";

export default function PlaygroundPage() {
  const router = useRouter();
  const [multiColumnMode, setMultiColumnMode] = useState(
    router.query.mode === "multi"
  );
  
  return multiColumnMode ? (
    <MultiPlaygroundProvider>
      <Page
        withPadding
        headerProps={{
          title: "Multi-Column Playground",
          help: {
            description: "Compare multiple prompts and models side by side",
            href: "https://langfuse.com/docs/playground",
          },
          actionButtonsRight: (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMultiColumnMode(false);
                  // Remove mode from URL
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { mode, ...query } = router.query;
                  void router.replace({
                    pathname: router.pathname,
                    query,
                  });
                }}
              >
                <SquareIcon className="h-4 w-4 mr-1" />
                Single Mode
              </Button>
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
  ) : (
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMultiColumnMode(true);
                  // Add mode to URL
                  void router.replace({
                    pathname: router.pathname,
                    query: { ...router.query, mode: "multi" },
                  });
                }}
              >
                <ColumnsIcon className="h-4 w-4 mr-1" />
                Multi-Column
              </Button>
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
