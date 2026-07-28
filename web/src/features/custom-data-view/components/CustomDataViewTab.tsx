// LFE-14544 — experimental "customize everything" demo spike.
//
// "Custom" tab of the observation detail view: the user describes how they
// want to see this observation's data, the AI returns a React component
// (source code), and we render it against the REAL observation data inside a
// sandboxed iframe (`/api/custom-view-sandbox`, opaque origin + its own CSP).
// Runtime errors in the sandbox post back here and can be round-tripped to
// the model ("fix it") — the iterate loop of the demo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, TriangleAlert, Wrench } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { sampleForPrompt } from "@/src/features/custom-data-view/lib/sampleForPrompt";
import { api } from "@/src/utils/api";

interface GeneratedView {
  code: string;
  instruction: string;
}

// Survives tab switches (Radix unmounts inactive tab content) and observation
// switches within the session. Spike-grade persistence — a saved/shareable
// view definition is an explicit post-demo fork.
const generatedViewCache = new Map<string, GeneratedView>();

const EXAMPLE_PROMPTS = [
  {
    label: "Chat bubbles",
    prompt:
      "Render the input/output as a chat conversation with role-colored bubbles; collapse the system prompt behind a toggle.",
  },
  {
    label: "Stats dashboard",
    prompt:
      "A compact dashboard: model, latency, token usage and cost as stat tiles on top, then input and output in two collapsible sections.",
  },
  {
    label: "Message table",
    prompt:
      "A dense table of all messages (role, first 120 characters of content, character count) with an expander to see the full message.",
  },
];

/** Resolve the app's current colors so the generated view matches the theme. */
function computeSandboxTheme(
  element: HTMLElement | null,
): Record<string, string> {
  if (!element) return {};
  let background = "";
  let node: HTMLElement | null = element;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      background = bg;
      break;
    }
    node = node.parentElement;
  }
  const styles = getComputedStyle(element);
  const foreground = styles.color;
  return {
    "--background": background || "transparent",
    "--foreground": foreground,
    "--muted-foreground": `color-mix(in srgb, ${foreground} 65%, ${background || "transparent"})`,
    "--border": `color-mix(in srgb, ${foreground} 18%, transparent)`,
    "--font-family": styles.fontFamily,
  };
}

export interface CustomDataViewTabProps {
  observation: ObservationReturnTypeWithMetadata;
  projectId: string;
  /** Parsed (preferred) or raw IO of the observation. */
  input: unknown;
  output: unknown;
  metadata: unknown;
  isIOLoading: boolean;
}

export function CustomDataViewTab({
  observation,
  projectId,
  input,
  output,
  metadata,
  isIOLoading,
}: CustomDataViewTabProps) {
  const [instruction, setInstruction] = useState(
    () => generatedViewCache.get(observation.id)?.instruction ?? "",
  );
  const [generated, setGenerated] = useState<GeneratedView | null>(
    () => generatedViewCache.get(observation.id) ?? null,
  );
  const [frameReady, setFrameReady] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The full object handed to the generated component (and, truncated, to the
  // model as a shape sample).
  const viewData = useMemo(
    () => ({
      id: observation.id,
      name: observation.name,
      type: observation.type,
      environment: observation.environment,
      level: observation.level,
      statusMessage: observation.statusMessage,
      model: observation.model,
      modelParameters: observation.modelParameters,
      promptName: observation.promptName,
      promptVersion: observation.promptVersion,
      startTime: observation.startTime,
      endTime: observation.endTime,
      latency: observation.latency,
      timeToFirstToken: observation.timeToFirstToken,
      usage: {
        input: observation.inputUsage,
        output: observation.outputUsage,
        total: observation.totalUsage,
      },
      usageDetails: observation.usageDetails,
      totalCost: observation.totalCost,
      costDetails: observation.costDetails,
      input,
      output,
      metadata,
    }),
    [observation, input, output, metadata],
  );

  const generateView = api.customDataView.generate.useMutation({
    onSuccess: (result, variables) => {
      const next: GeneratedView = {
        code: result.code,
        instruction: variables.instruction,
      };
      generatedViewCache.set(observation.id, next);
      setGenerated(next);
      setSandboxError(null);
    },
  });

  const runGeneration = useCallback(
    (instructionText: string) => {
      const trimmed = instructionText.trim();
      if (!trimmed || generateView.isPending) return;
      generateView.mutate({
        projectId,
        instruction: trimmed,
        dataSample: sampleForPrompt(viewData),
        previousCode: generated?.code,
        lastError: sandboxError ?? undefined,
      });
    },
    [generateView, projectId, viewData, generated, sandboxError],
  );

  const resetView = () => {
    generatedViewCache.delete(observation.id);
    setGenerated(null);
    setSandboxError(null);
    setShowCode(false);
    setFrameReady(false);
  };

  // Sandbox iframe is an external system: listen for its lifecycle messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as {
        source?: string;
        type?: string;
        message?: string;
      } | null;
      if (message?.source !== "custom-view-sandbox") return;
      if (message.type === "ready") {
        setFrameReady(true);
      } else if (message.type === "rendered") {
        setSandboxError(null);
      } else if (message.type === "error") {
        setSandboxError(message.message ?? "Unknown sandbox error");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Push the latest code + data + theme into the sandbox whenever available.
  useEffect(() => {
    if (!frameReady || !generated) return;
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(
      {
        type: "render",
        code: generated.code,
        data: viewData,
        theme: computeSandboxTheme(containerRef.current),
      },
      // Sandboxed (opaque-origin) frames are only addressable with "*"; the
      // payload is the user's own observation data rendered back to them.
      "*",
    );
  }, [frameReady, generated, viewData]);

  const pending = generateView.isPending;

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-2"
    >
      <div className="border-dark-yellow bg-light-yellow text-dark-yellow flex shrink-0 items-start gap-2 rounded-md border px-2 py-1.5 text-xs">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Experimental demo — this view is AI-generated from a system prompt
          hardcoded in this build and rendered in a sandboxed iframe. In
          production, the prompt would be managed in Langfuse.
        </span>
      </div>

      <form
        className="flex shrink-0 items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          runGeneration(instruction);
        }}
      >
        <Textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Describe how you want to see this observation's data…"
          rows={2}
          className="min-h-0 flex-1 resize-none text-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              runGeneration(instruction);
            }
          }}
        />
        <Button
          type="submit"
          size="sm"
          disabled={pending || isIOLoading || !instruction.trim()}
        >
          {pending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" />
          )}
          {generated ? "Update view" : "Generate view"}
        </Button>
      </form>

      {generateView.error && (
        <div className="border-destructive text-destructive shrink-0 rounded-md border px-2 py-1.5 text-xs">
          {generateView.error.message}
        </div>
      )}

      {sandboxError && (
        <div className="border-destructive text-destructive flex shrink-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
          <span className="min-w-0 flex-1 break-words">
            The generated view failed: {sandboxError}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => runGeneration("Fix the runtime error.")}
          >
            <Wrench className="mr-1 h-3.5 w-3.5" />
            Ask AI to fix
          </Button>
        </div>
      )}

      {generated ? (
        <>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-xs">
              Rendered in a sandboxed iframe on the real observation data.
            </span>
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCode((value) => !value)}
              >
                {showCode ? "Hide code" : "View code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetView}
              >
                Reset
              </Button>
            </div>
          </div>
          {showCode && (
            <pre className="bg-muted/50 max-h-56 shrink-0 overflow-auto rounded-md border p-2 text-xs">
              {generated.code}
            </pre>
          )}
          <div className="relative min-h-0 w-full flex-1">
            <iframe
              ref={iframeRef}
              src="/api/custom-view-sandbox"
              sandbox="allow-scripts"
              title="AI-generated custom view (sandboxed)"
              className="h-full w-full rounded-md border"
            />
            {(pending || !frameReady) && (
              <div className="bg-background/60 absolute inset-0 flex items-center justify-center rounded-md">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {pending ? "Generating view with AI…" : "Loading sandbox…"}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          {pending ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating view with AI…
            </div>
          ) : (
            <>
              <Sparkles className="text-muted-foreground h-6 w-6" />
              <p className="text-muted-foreground max-w-md text-sm">
                Describe how you want to see this observation — the AI writes a
                custom React view and renders it on the real data.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {EXAMPLE_PROMPTS.map((example) => (
                  <Button
                    key={example.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setInstruction(example.prompt)}
                  >
                    {example.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
