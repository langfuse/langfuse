import { useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { QUESTION_EXAMPLES } from "../DecisionModelQuestionList/DecisionModelQuestionList";
import { DecisionModelQuestionCard } from "./DecisionModelQuestionCard";

const meta = preview.meta({ component: DecisionModelQuestionCard });

const STATE_KEYS = ["input", "output"];

const base = {
  index: 0,
  stateKeys: STATE_KEYS,
  expanded: true,
  onExpandedChange: fn(),
  onChange: fn(),
  onRemove: fn(),
};

export const Choice = meta.story({
  args: {
    ...base,
    question: {
      id: "q1",
      ...QUESTION_EXAMPLES[DecisionModelQuestionType.CHOICE],
    },
  },
  render: (args) => {
    const [question, setQuestion] = useState(args.question);
    const [expanded, setExpanded] = useState(args.expanded);
    return (
      <DecisionModelQuestionCard
        {...args}
        question={question}
        expanded={expanded}
        onExpandedChange={(next) => {
          setExpanded(next);
          args.onExpandedChange(next);
        }}
        onChange={(next) => {
          setQuestion(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const Score = meta.story({
  args: {
    ...base,
    question: {
      id: "q2",
      ...QUESTION_EXAMPLES[DecisionModelQuestionType.SCORE],
    },
  },
});

export const YesNo = meta.story({
  args: {
    ...base,
    question: {
      id: "q3",
      ...QUESTION_EXAMPLES[DecisionModelQuestionType.NOUL],
    },
  },
});

export const Blank = meta.story({
  args: {
    ...base,
    onRemove: null,
    question: {
      id: "q4",
      type: DecisionModelQuestionType.CHOICE,
      scoreName: "",
      instructions: "",
      options: [
        { value: "", description: "" },
        { value: "", description: "" },
      ],
      levels: [{ description: "" }, { description: "" }],
      criteria: { true: "", false: "" },
    },
  },
  render: (args) => {
    const [question, setQuestion] = useState(args.question);
    return (
      <DecisionModelQuestionCard
        {...args}
        question={question}
        onChange={(next) => {
          setQuestion(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const Collapsed = meta.story({
  args: {
    ...base,
    expanded: false,
    question: {
      id: "q1",
      ...QUESTION_EXAMPLES[DecisionModelQuestionType.CHOICE],
    },
  },
});

export const WithErrors = meta.story({
  args: {
    ...base,
    question: {
      id: "q5",
      ...QUESTION_EXAMPLES[DecisionModelQuestionType.CHOICE],
      scoreName: "send_readiness",
      options: [
        { value: "ready", description: "" },
        { value: "ready", description: "" },
      ],
    },
    errors: {
      scoreName: "Another question already writes “send_readiness”.",
      options: "Option labels must be unique.",
    },
  },
});
