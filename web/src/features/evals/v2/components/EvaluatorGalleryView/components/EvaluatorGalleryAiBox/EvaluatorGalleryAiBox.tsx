import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";

/** Free-text starting point that hands the description to the assistant. */
export function EvaluatorGalleryAiBox({
  onSubmit,
}: {
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const submit = () => {
    const trimmed = prompt.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form
      className="bg-background focus-within:ring-ring flex flex-col gap-2 rounded-md border p-3 focus-within:ring-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        rows={2}
        aria-label="Describe what you want to check"
        placeholder="Describe what you want to check, e.g. flag replies with medical advice"
        className="placeholder:text-muted-foreground w-full resize-none border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="secondary"
          icon={Sparkles}
          text="Build with AI"
          disabled={!prompt.trim()}
        />
      </div>
    </form>
  );
}
