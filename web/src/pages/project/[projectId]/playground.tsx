import Header from "@/src/components/layouts/header";
import Playground from "@/src/components/playground";

export default function PlaygroundPage() {
  return (
    <div className="flex h-[95vh] flex-col">
      <Header
        title="Playground"
        help={{
          description: "A sandbox to test and interate your prompts",
        }}
      />
      <div className="flex-1 overflow-auto">
        <Playground />
      </div>
    </div>
  );
}
