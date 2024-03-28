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
