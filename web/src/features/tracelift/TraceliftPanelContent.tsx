import { BotMessageSquare, Check, CircleCheck, Copy, X } from "lucide-react";
import { useState } from "react";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { TraceliftFindingSection } from "./TraceliftFindingSection";
import { type TraceliftFinding } from "./types";
import { TRACELIFT_TITLE } from "./constants";

type TraceliftPanelContentProps = {
  onClose: () => void;
  onOpenAssistant?: (prompt: string) => void;
  onViewObservations: (finding: TraceliftFinding) => void;
  onViewExample: () => void;
} & (
  | { status: "success"; findings: TraceliftFinding[] }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
);

export function TraceliftPanelContent(props: TraceliftPanelContentProps) {
  const { onClose, onOpenAssistant, onViewObservations, onViewExample } = props;
  const [copyState, setCopyState] = useState<"idle" | "copying" | "failed">(
    "idle",
  );
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const findings = props.status === "success" ? props.findings : [];
  const prompt = findings
    .flatMap((finding) => (finding.prompt ? [finding.prompt] : []))
    .join("\n\n---\n\n");
  const copyPrompt = async () => {
    setCopyState("copying");
    try {
      await copyTextToClipboard(prompt);
      setCopiedPrompt(prompt);
      setCopyState("idle");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section
      aria-label={TRACELIFT_TITLE}
      className="bg-background flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <div className="flex items-start justify-between gap-4 border-b px-4 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">{TRACELIFT_TITLE}</h2>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span className="text-muted-foreground">
              What does a good trace look like?
            </span>
            <Button
              text="Read docs"
              href="https://langfuse.com/docs/observability/best-practices"
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
        <IconButton
          icon={X}
          label={`Close ${TRACELIFT_TITLE}`}
          onClick={onClose}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {props.status === "loading" && (
          <div
            role="status"
            className="text-muted-foreground flex items-center gap-2 py-6 text-sm"
          >
            <Spinner size="sm" /> Loading suggestions…
          </div>
        )}
        {props.status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 py-6 text-sm"
          >
            <p>Could not load suggestions.</p>
            <Button
              text="Retry"
              variant="secondary"
              size="sm"
              onClick={props.onRetry}
            />
          </div>
        )}
        {props.status === "success" && findings.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <CircleCheck className="text-muted-foreground size-6" aria-hidden />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold">No suggestions yet</h3>
              <p className="text-muted-foreground text-sm">
                No supported findings have been recorded in the last 30 days.
              </p>
            </div>
          </div>
        )}
        {findings.length > 0 && (
          <div className="flex flex-col gap-6 pt-4">
            <div>
              <Accordion type="multiple" defaultValue={[findings[0]!.id]}>
                {findings.map((finding) => (
                  <TraceliftFindingSection
                    key={finding.id}
                    finding={finding}
                    onViewObservations={onViewObservations}
                    onViewExample={onViewExample}
                  />
                ))}
              </Accordion>
            </div>
            {prompt && (
              <section
                aria-label="Improve with a coding agent"
                className="flex flex-col gap-3"
              >
                <Accordion
                  type="single"
                  collapsible
                  defaultValue="coding-agent"
                >
                  <Accordion.Item value="coding-agent">
                    <Accordion.Trigger size="sm">
                      Improve with a coding agent
                    </Accordion.Trigger>
                    <Accordion.Content>
                      <div className="flex flex-col gap-3 pt-2 pb-4">
                        <div className="flex flex-col gap-1">
                          <p className="text-muted-foreground text-sm">
                            One prompt with all suggestions and examples. Paste
                            it into Claude Code or your preferred coding agent.
                          </p>
                        </div>
                        <div className="flex">
                          <Button
                            text={
                              copiedPrompt === prompt
                                ? "Prompt copied"
                                : "Copy prompt"
                            }
                            icon={copiedPrompt === prompt ? Check : Copy}
                            variant="secondary"
                            size="sm"
                            loading={copyState === "copying"}
                            onClick={copyPrompt}
                          />
                        </div>
                        <pre
                          aria-label="Instrumentation prompt"
                          className="ph-no-capture bg-muted/50 text-muted-foreground max-h-32 overflow-y-auto rounded-md border p-3 text-xs break-words whitespace-pre-wrap"
                        >
                          {prompt}
                        </pre>
                        {copyState === "failed" && (
                          <p
                            role="status"
                            className="text-muted-foreground text-xs"
                          >
                            Could not copy the prompt. Allow clipboard access
                            and try again.
                          </p>
                        )}
                        {onOpenAssistant && (
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                            <p className="text-muted-foreground text-xs">
                              Explore these suggestions in Langfuse
                            </p>
                            <Button
                              text="Use Assistant"
                              icon={BotMessageSquare}
                              size="sm"
                              variant="secondary"
                              onClick={() => onOpenAssistant(prompt)}
                            />
                          </div>
                        )}
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
