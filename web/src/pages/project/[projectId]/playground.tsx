// NOTE: There is a possibility that this feature might transition from the MIT licensed version to the
// enterprise version in the future. Please consider this when planning long-term use and integration of
// this functionality into your projects.

import Header from "@/src/components/layouts/header";
import Playground from "@/src/features/playground/client";
import { PlaygroundProvider } from "@/src/features/playground/client/context";

export default function PlaygroundPage() {
  return (
    <div className="flex h-[95vh] flex-col">
      <Header
        title="Playground"
        help={{
          description: "A sandbox to test and iterate your prompts",
        }}
      />
      <div className="flex-1 overflow-auto">
        <PlaygroundProvider>
          <Playground />
        </PlaygroundProvider>
      </div>
    </div>
  );
}
