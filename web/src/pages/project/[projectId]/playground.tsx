// NOTE: We may transition this feature from our MIT licensed repository to the
// a commercial License (ee folder) once we release a first stable version.
// Please consider this when planning long-term use and integration of this functionality into your projects.
// For more information see https://langfuse.com/docs/open-source

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
        featureBetaURL="https://github.com/orgs/langfuse/discussions/1170"
      />
      <div className="flex-1 overflow-auto">
        <PlaygroundProvider>
          <Playground />
        </PlaygroundProvider>
      </div>
    </div>
  );
}
