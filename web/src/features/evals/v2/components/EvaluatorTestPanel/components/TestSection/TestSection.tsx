import type { ReactNode } from "react";

import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";

export function TestSection({ content }: { content: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Test with the sample"
        meta={null}
        description={null}
        tooltip="Run the evaluator against the selected observation before saving it."
        trailing={null}
      />
      {content}
    </section>
  );
}
