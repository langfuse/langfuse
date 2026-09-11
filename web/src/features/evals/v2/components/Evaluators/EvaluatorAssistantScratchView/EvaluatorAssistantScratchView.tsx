import {
  type KeyboardEvent,
  type SyntheticEvent,
  useRef,
  useState,
} from "react";
import { SendHorizontal, Sparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";

const EXAMPLE_PROMPTS = [
  "Fail when the answer contradicts the retrieved context",
  "Check the answer only uses facts from the retrieved documents",
  "Score helpfulness 1–5 with a one-sentence reason",
];

export function EvaluatorAssistantScratchView({
  evaluatorType,
  onSubmit,
  onConfigureManually,
}: {
  evaluatorType: "CODE" | "LLM_AS_JUDGE";
  onSubmit: (request: string) => Promise<boolean>;
  onConfigureManually: () => void;
}) {
  const [request, setRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequest = request.trim();
    if (!trimmedRequest || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const started = await onSubmit(trimmedRequest);
      if (started) setRequest("");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-10 sm:px-8 sm:py-16">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-2xl flex-col gap-5"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-primary-accent flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Describe your evaluator
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What should this evaluator check?
          </h2>
        </div>

        <div
          role="group"
          aria-label="Evaluator request composer"
          className="border-input bg-background focus-within:ring-ring @container/composer overflow-hidden rounded-md border shadow-xs focus-within:ring-1"
        >
          <Textarea
            aria-label="Describe the evaluator you want"
            autoFocus
            autoComplete="off"
            maxLength={2000}
            rows={5}
            placeholder="Classify each user message into one topic: support, billing, technical, sales, feedback"
            value={request}
            disabled={isSubmitting}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={handleKeyDown}
            className="ph-no-capture min-h-32 resize-y rounded-none border-0 text-base shadow-none focus-visible:ring-0"
          />
          <div className="border-border flex justify-end border-t border-dashed p-2">
            <Button
              type="submit"
              size="sm"
              aria-label="Create evaluator"
              disabled={!request.trim() || isSubmitting}
              loading={isSubmitting}
              className="shrink-0 gap-1.5"
            >
              <span className="@max-[360px]/composer:sr-only">
                Create evaluator
              </span>
              <SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <section
          aria-labelledby="evaluator-example-prompts"
          className="flex flex-col gap-2"
        >
          <p
            id="evaluator-example-prompts"
            className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase"
          >
            Try one of these
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                disabled={isSubmitting}
                className="border-border bg-card text-card-foreground hover:bg-accent focus-visible:ring-ring min-w-0 flex-[1_1_12rem] rounded-md border px-3 py-2 text-left text-sm text-wrap transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setRequest(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        <Button
          type="button"
          variant="link"
          disabled={isSubmitting}
          className="self-center"
          onClick={onConfigureManually}
        >
          Configure it manually instead
        </Button>

        <span className="sr-only">
          Creating a{" "}
          {evaluatorType === "CODE" ? "code evaluator" : "LLM-as-a-judge"}
        </span>
      </form>
    </main>
  );
}
