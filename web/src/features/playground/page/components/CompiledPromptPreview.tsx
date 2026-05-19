import { useState } from "react";
import nunjucks from "nunjucks";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { usePlaygroundContext } from "../context";

// Configure a client-side Nunjucks environment (no filesystem, no autoescape)
const clientEnv = new nunjucks.Environment(null as never, {
  autoescape: false,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
});

function compileTemplate(
  template: string,
  variables: Record<string, unknown>,
): { compiled: string; error: string | null } {
  try {
    const compiled = clientEnv.renderString(template, variables);
    return { compiled, error: null };
  } catch (e) {
    return { compiled: template, error: String(e) };
  }
}

export const CompiledPromptPreview: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, promptVariables } = usePlaygroundContext();

  const variables = promptVariables.reduce(
    (acc, v) => {
      if (v.variableType === "json") {
        try {
          acc[v.name] = JSON.parse(v.value);
        } catch {
          acc[v.name] = v.value;
        }
      } else {
        acc[v.name] = v.value;
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );

  const compiledParts: { role: string; content: string; error?: string }[] = [];

  for (const msg of messages) {
    // Only template messages that have string content (skip placeholders, tool call parts, etc.)
    const content =
      "content" in msg && typeof msg.content === "string" ? msg.content : null;
    if (content === null) continue;
    const { compiled, error } = compileTemplate(content, variables);
    compiledParts.push({
      role: "role" in msg ? String(msg.role) : "unknown",
      content: compiled,
      ...(error ? { error } : {}),
    });
  }

  const hasErrors = compiledParts.some((p) => p.error);

  return (
    <div className="border-t">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start rounded-none px-3 py-2 text-xs font-medium"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? (
          <ChevronDown size={12} className="mr-1" />
        ) : (
          <ChevronRight size={12} className="mr-1" />
        )}
        Compiled Preview
        {hasErrors && (
          <span className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            warnings
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="max-h-80 overflow-y-auto px-3 pb-3">
          {compiledParts.length === 0 ? (
            <p className="text-muted-foreground text-xs">No messages.</p>
          ) : (
            <div className="space-y-2">
              {compiledParts.map((part, i) => (
                <div key={i} className="rounded border p-2">
                  <p className="text-muted-foreground mb-1 text-xs font-medium capitalize">
                    {part.role}
                  </p>
                  <pre className="font-mono text-xs break-words whitespace-pre-wrap">
                    {part.content}
                  </pre>
                  {part.error && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      {part.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
