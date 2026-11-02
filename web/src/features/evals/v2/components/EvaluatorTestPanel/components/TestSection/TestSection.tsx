import type { ReactNode } from "react";

import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";

export function TestSection({ content }: { content: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-2">
      <SectionHeader
        title="Test the evaluator"
        meta={null}
        description={null}
        tooltip="Run the evaluator against the selected observation to check that it scores the way you'd expect."
        trailing={null}
      />
      {content}
    </section>
  );
}
