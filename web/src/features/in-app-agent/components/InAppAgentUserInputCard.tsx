"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import type { InAppAgentToolCallContent } from "@/src/features/in-app-agent/components/utils/utils";
import type { InAppAgentUserInputPayload } from "@langfuse/shared/in-app-agent";

type InAppAgentUserInput = NonNullable<InAppAgentToolCallContent["userInput"]>;

export function InAppAgentUserInputCard({
  userInput,
  isCompact = false,
  isDisabled = false,
  onSubmitUserInput,
}: {
  userInput: InAppAgentUserInput;
  isCompact?: boolean;
  isDisabled?: boolean;
  onSubmitUserInput?: (
    userInputId: string,
    payload: InAppAgentUserInputPayload,
  ) => Promise<void>;
}) {
  const options = userInput.options ?? [];
  const isMultiSelect = userInput.selectionMode === "multi_select";
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isPending = userInput.status === "pending";
  const isBusy = isSubmitting || userInput.status === "submitting";

  const payload = useMemo((): InAppAgentUserInputPayload | null => {
    if (options.length === 0) {
      const answer = details.trim();
      return answer.length > 0 ? { answer } : null;
    }

    if (selected.length === 0) {
      return null;
    }

    const answer = isMultiSelect ? selected : selected[0];
    const extra = details.trim();
    return extra.length > 0 ? { answer, details: extra } : { answer };
  }, [details, isMultiSelect, options.length, selected]);

  const toggleOption = (label: string) => {
    setSelected((current) => {
      if (isMultiSelect) {
        return current.includes(label)
          ? current.filter((value) => value !== label)
          : [...current, label];
      }

      return current[0] === label ? [] : [label];
    });
  };

  const submit = async () => {
    if (!isPending || isBusy || !payload || !onSubmitUserInput) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitUserInput(userInput.id, payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "bg-card text-foreground border-border rounded-2xl border shadow-xs",
        isCompact
          ? "rounded-xl px-2.5 py-2 text-[0.775rem]"
          : "px-3 py-2.5 text-sm",
      )}
    >
      <p className="text-sm leading-5">{userInput.question}</p>
      {options.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((option) => {
            const isSelected = selected.includes(option.label);
            return (
              <Button
                key={option.label}
                type="button"
                size="sm"
                variant={isSelected ? "secondary" : "outline"}
                disabled={!isPending || isBusy || isDisabled}
                aria-pressed={isSelected}
                title={option.description}
                onClick={() => {
                  toggleOption(option.label);
                }}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      ) : null}
      <Textarea
        className="mt-2 min-h-[4.5rem]"
        disabled={!isPending || isBusy || isDisabled}
        placeholder={
          options.length > 0 ? "Add more detail (optional)" : "Your answer"
        }
        value={details}
        onChange={(event) => {
          setDetails(event.target.value);
        }}
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!isPending || isBusy || isDisabled || payload === null}
          onClick={() => {
            submit().catch(() => undefined);
          }}
        >
          {isBusy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Submit
        </Button>
      </div>
    </div>
  );
}
