import { CheckCircle2, Circle, TrashIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { CodeMirrorEditor } from "@/src/components/editor";
import { useState, useCallback } from "react";
import { type ChatMessage, PromptChatMessageListSchema } from "@langfuse/shared";

import { usePlaygroundContext } from "../context";
import { type PlaceholderMessageFillIn } from "../types";

export const MessagePlaceholderComponent: React.FC<{
  messagePlaceholder: PlaceholderMessageFillIn;
}> = ({ messagePlaceholder }) => {
  const { updateMessagePlaceholderValue, deleteMessagePlaceholder } =
    usePlaygroundContext();
  const { name, value, isUsed } = messagePlaceholder;
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = useCallback((jsonString: string) => {
    try {
      const parsed = jsonString.trim() === "" ? [] : JSON.parse(jsonString);
      const result = PromptChatMessageListSchema.safeParse(parsed);

      if (result.success) {
        updateMessagePlaceholderValue(name, result.data as ChatMessage[]);
        setError(null);
      } else {
        setError(result.error.issues[0]?.message || "Invalid chat message format, ensure it has role and content keys.");
      }
    } catch {
      setError("Invalid JSON format");
    }
  }, [name, updateMessagePlaceholderValue]);

  const UsedIcon = isUsed ? CheckCircle2 : Circle;
  const iconColor = isUsed ? "green" : "grey";

  return (
    <div className="p-1">
      <div className="mb-1 flex flex-row items-center">
        <span className="flex flex-1 flex-row space-x-2 text-xs">
          <UsedIcon size={16} color={iconColor} />
          <p className="min-w-[90px] truncate font-mono" title={name}>
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
        value={value.length === 0 ? `[\n  {\n    "role": "",\n    "content": ""\n  }\n]` : JSON.stringify(value, null, 2)}
        onChange={handleInputChange}
        mode="json"
        minHeight="none"
        className="max-h-[15rem] w-full resize-y p-1 font-mono text-xs focus:outline-none"
        editable={true}
        lineNumbers={false}
        placeholder={`[\n  {\n    "role": "user",\n    "content": "Hello!"\n  },\n  {\n    "role": "assistant",\n    "content": "Hi there!"\n  }\n]`}
      />

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};
