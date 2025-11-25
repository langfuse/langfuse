import { CheckCircle2, Circle, TrashIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { CodeMirrorEditor } from "@/src/components/editor";
import { useState, useCallback } from "react";
import { type ChatMessage } from "@langfuse/shared";

import { usePlaygroundContext } from "../context";
import { type PlaceholderMessageFillIn } from "../types";
import { useNamingConflicts } from "../hooks/useNamingConflicts";

export const MessagePlaceholderComponent: React.FC<{
  messagePlaceholder: PlaceholderMessageFillIn;
}> = ({ messagePlaceholder }) => {
  const {
    updateMessagePlaceholderValue,
    deleteMessagePlaceholder,
    promptVariables,
    messagePlaceholders,
  } = usePlaygroundContext();
  const { name, value, isUsed } = messagePlaceholder;
  const [error, setError] = useState<string | null>(null);
  const { isPlaceholderConflicting } = useNamingConflicts(
    promptVariables,
    messagePlaceholders,
  );
  const hasConflict = isPlaceholderConflicting(name);

  const handleInputChange = useCallback(
    (jsonString: string) => {
      try {
        const parsed = jsonString.trim() === "" ? [] : JSON.parse(jsonString);

        // Basic validation: must be an array of objects
        if (!Array.isArray(parsed)) {
          setError("Input must be an array of objects");
          return;
        }

        // Check that all items are objects
        const allObjects = parsed.every(
          (item) =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        );

        if (!allObjects) {
          setError("All items must be objects");
          return;
        }

        // Allow arbitrary objects - no strict role/content validation
        updateMessagePlaceholderValue(name, parsed as ChatMessage[]);
        setError(null);
      } catch {
        setError("Invalid JSON format");
      }
    },
    [name, updateMessagePlaceholderValue],
  );

  const UsedIcon = isUsed ? CheckCircle2 : Circle;
  const iconColor = isUsed ? "green" : "grey";

  return (
    <div className="p-1">
      <div className="mb-1 flex flex-row items-center">
        <span className="flex flex-1 flex-row space-x-2 text-xs">
          <UsedIcon size={16} color={iconColor} />
          <p
            className={`min-w-[90px] truncate font-mono ${hasConflict ? "text-red-500" : ""}`}
            title={name}
          >
            {name ? name : "Unnamed placeholder"}
          </p>
        </span>
        <Button
          variant="ghost"
          size="icon"
          title="Delete placeholder"
          disabled={isUsed}
          onClick={() => deleteMessagePlaceholder(name)}
          className="p-0"
        >
          {!isUsed && <TrashIcon size={16} />}
        </Button>
      </div>

      <CodeMirrorEditor
        value={
          value.length === 0
            ? `[\n  {\n    "role": "",\n    "content": ""\n  }\n]`
            : JSON.stringify(value, null, 2)
        }
        onChange={handleInputChange}
        mode="json"
        minHeight="none"
        className={`max-h-[15rem] w-full resize-y p-1 font-mono text-xs focus:outline-none ${hasConflict ? "border border-red-500" : ""}`}
        editable={true}
        lineNumbers={false}
        placeholder={`[\n  {\n    "role": "user",\n    "content": "Hello!"\n  },\n  {\n    "role": "assistant",\n    "content": "Hi there!"\n  }\n]`}
      />

      {hasConflict && (
        <p className="mt-1 text-xs text-red-500">
          Placeholder name conflicts with variable. Names must be unique.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
};
