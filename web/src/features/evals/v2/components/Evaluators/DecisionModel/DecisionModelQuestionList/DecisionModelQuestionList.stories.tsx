import { useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { createEmptyQuestion } from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import { moveItem } from "@/src/features/evals/v2/fns/moveItem";
import type { DecisionModelQuestionDraft } from "@/src/features/evals/v2/types/decisionModel";
import {
  DecisionModelQuestionList,
  QUESTION_EXAMPLES,
} from "./DecisionModelQuestionList";

const meta = preview.meta({ component: DecisionModelQuestionList });

const STATE_KEYS = ["input", "output"];

const THREE_QUESTIONS: DecisionModelQuestionDraft[] = [
  { id: "q1", ...QUESTION_EXAMPLES[DecisionModelQuestionType.CHOICE] },
  { id: "q2", ...QUESTION_EXAMPLES[DecisionModelQuestionType.SCORE] },
  { id: "q3", ...QUESTION_EXAMPLES[DecisionModelQuestionType.NOUL] },
];

const callbacks = {
  onExpandedChange: fn(),
  onChange: fn(),
  onAdd: fn(),
  onAddExample: fn(),
  onRemove: fn(),
  onReorder: fn(),
};

type StoryArgs = React.ComponentProps<typeof DecisionModelQuestionList>;

/** Shared by the editable stories: local state so add / edit / reorder / remove work in the canvas. */
function InteractiveQuestionList(args: StoryArgs) {
  const [questions, setQuestions] = useState(args.questions);
  const [expandedId, setExpandedId] = useState(args.expandedId);
  const nextId = () => `q-${Date.now()}`;
  return (
    <DecisionModelQuestionList
      {...args}
      questions={questions}
      expandedId={expandedId}
      onExpandedChange={(id) => {
        setExpandedId(id);
        args.onExpandedChange(id);
      }}
      onChange={(next) => {
        setQuestions((current) =>
          current.map((question) =>
            question.id === next.id ? next : question,
          ),
        );
        args.onChange(next);
      }}
      onAdd={() => {
        const question = createEmptyQuestion();
        setQuestions((current) => [...current, question]);
        setExpandedId(question.id);
        args.onAdd();
      }}
      onAddExample={(type) => {
        const question = { id: nextId(), ...QUESTION_EXAMPLES[type] };
        setQuestions((current) => [...current, question]);
        setExpandedId(question.id);
        args.onAddExample(type);
      }}
      onRemove={(id) => {
        setQuestions((current) =>
          current.filter((question) => question.id !== id),
        );
        args.onRemove(id);
      }}
      onReorder={(from, to) => {
        setQuestions((current) => moveItem(current, from, to));
        args.onReorder(from, to);
      }}
    />
  );
}

/** Full editing flow: add, edit, reorder, remove, collapse. */
export const Default = meta.story({
  args: {
    ...callbacks,
    questions: THREE_QUESTIONS,
    expandedId: "q1",
    stateKeys: STATE_KEYS,
  },
  render: (args) => <InteractiveQuestionList {...args} />,
});

export const Empty = meta.story({
  args: {
    ...callbacks,
    questions: [],
    expandedId: null,
    stateKeys: STATE_KEYS,
  },
  render: (args) => <InteractiveQuestionList {...args} />,
});

export const AllCollapsed = meta.story({
  args: {
    ...callbacks,
    questions: THREE_QUESTIONS,
    expandedId: null,
    stateKeys: STATE_KEYS,
  },
});

export const WithErrors = meta.story({
  args: {
    ...callbacks,
    questions: [
      THREE_QUESTIONS[0]!,
      { ...THREE_QUESTIONS[2]!, scoreName: "send_readiness" },
    ],
    expandedId: null,
    stateKeys: STATE_KEYS,
    errorsById: {
      q3: { scoreName: "Another question already writes “send_readiness”." },
    },
  },
});
