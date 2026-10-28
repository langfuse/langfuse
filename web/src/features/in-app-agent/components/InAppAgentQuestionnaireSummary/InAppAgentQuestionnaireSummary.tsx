import type { InAppAgentQuestionnaireResult } from "@langfuse/shared/in-app-agent";

export type InAppAgentQuestionnaireSummaryProps = {
  answers: InAppAgentQuestionnaireResult["answers"];
};

export function InAppAgentQuestionnaireSummary({
  answers,
}: InAppAgentQuestionnaireSummaryProps) {
  return (
    <dl className="ph-no-capture border-border bg-muted flex flex-col gap-2 rounded-md border p-2.5 text-xs">
      {answers.map((answer, index) => (
        <div key={index} className="flex flex-col gap-0.5">
          <dt className="text-foreground font-bold">{answer.question}</dt>
          <QuestionnaireSummaryAnswer answer={answer} />
        </div>
      ))}
    </dl>
  );
}

function QuestionnaireSummaryAnswer({
  answer,
}: {
  answer: InAppAgentQuestionnaireResult["answers"][number];
}) {
  if (answer.skipped) {
    return <dd className="text-muted-foreground italic">Skipped</dd>;
  }

  return <dd className="text-foreground">{answer.answer.join(", ")}</dd>;
}
