"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Separator } from "../ui/separator";
import type { SpielwieseModelRecommendationTarget } from "./spielwieseModelRecommendationState";

type QuestionOption = {
  id: string;
  label: string;
};

type RecommendationQuestion = {
  description: string;
  id: string;
  options: QuestionOption[];
  title: string;
};

const recommendationQuestions: RecommendationQuestion[] = [
  {
    id: "goal",
    title: "What kind of work is this node doing?",
    description:
      "Pick the dominant workload so the recommendation can weight the right models.",
    options: [
      { id: "reasoning", label: "Reasoning" },
      { id: "vision", label: "Vision" },
      { id: "extraction", label: "Extraction" },
      { id: "agentic", label: "Tool use" },
    ],
  },
  {
    id: "tradeoff",
    title: "What matters most right now?",
    description:
      "This is the core product tradeoff the picker will optimize first.",
    options: [
      { id: "quality", label: "Best quality" },
      { id: "balanced", label: "Balanced" },
      { id: "cost", label: "Lowest cost" },
    ],
  },
  {
    id: "tempo",
    title: "How is this going to run?",
    description:
      "Interactive flows want different models than batch or background jobs.",
    options: [
      { id: "realtime", label: "Real-time" },
      { id: "workflow", label: "Workflow" },
      { id: "batch", label: "Batch" },
    ],
  },
];

function RecommendationOptionButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className="justify-start"
      size="sm"
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function RecommendationQuestionCard({
  answer,
  onAnswerChange,
  question,
}: {
  answer: string | null;
  onAnswerChange: (value: string) => void;
  question: RecommendationQuestion;
}) {
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-sm">{question.title}</CardTitle>
        <CardDescription>{question.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {question.options.map((option) => (
          <RecommendationOptionButton
            isActive={answer === option.id}
            key={option.id}
            label={option.label}
            onClick={() => onAnswerChange(option.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export function SpielwieseModelRecommendationHeader({
  onBack,
  target,
}: {
  onBack: () => void;
  target: SpielwieseModelRecommendationTarget;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="text-muted-foreground size-4 shrink-0" />
          <p className="text-sm font-semibold">Recommend me a model</p>
        </div>
        <p className="text-muted-foreground text-sm">
          {target.nodeTitle} is currently on {target.providerLabel} /{" "}
          {target.currentModel}.
        </p>
      </div>
      <Button
        className="shrink-0"
        size="sm"
        type="button"
        variant="ghost"
        onClick={onBack}
      >
        <ArrowLeft data-icon="inline-start" />
        Back
      </Button>
    </div>
  );
}

function RecommendationSummaryCard({
  target,
}: {
  target: SpielwieseModelRecommendationTarget;
}) {
  return (
    <Card className="border-border/60 bg-muted/25 shadow-none">
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-sm">
          Recommendation output comes next
        </CardTitle>
        <CardDescription>
          I left the answer area intentionally lightweight so you can give the
          next round of questions and recommendation logic after this structure
          is in place.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="bg-background/70 flex flex-col gap-2 rounded-xl p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Target node</p>
            <p className="text-muted-foreground text-sm">{target.nodeId}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Current model</p>
            <p className="text-muted-foreground text-sm">
              {target.currentModel}
            </p>
          </div>
          <p className={cn("text-muted-foreground text-sm", "text-pretty")}>
            Once you define the follow-up questions, this pane can turn these
            answers into a single recommended model and a short why-this-one
            rationale.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SpielwieseModelRecommendationPanel({
  target,
}: {
  target: SpielwieseModelRecommendationTarget;
}) {
  const [answers, setAnswers] = useState<Record<string, string | null>>({
    goal: null,
    tempo: null,
    tradeoff: null,
  });
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="spielwiese-model-recommendation-panel"
    >
      {recommendationQuestions.map((question) => (
        <RecommendationQuestionCard
          answer={answers[question.id] ?? null}
          key={question.id}
          onAnswerChange={(value) =>
            setAnswers((currentAnswers) => ({
              ...currentAnswers,
              [question.id]: value,
            }))
          }
          question={question}
        />
      ))}
      <Separator />
      <RecommendationSummaryCard target={target} />
    </div>
  );
}
