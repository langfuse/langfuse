import { useState, useRef, useEffect } from "react";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { Button } from "@/src/components/ui/button";

import { PromptSelectionDialog } from "@/src/features/prompts/components/PromptSelectionDialog";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Plus } from "lucide-react";

type PromptLinkingEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  minHeight?: number | string;
  className?: string;
};

export function PromptLinkingEditor({
  value,
  onChange,
  onBlur,
  minHeight,
  className,
}: PromptLinkingEditorProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const projectId = useProjectIdFromURL();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);

  // Store cursor position when the dialog is opened
  useEffect(() => {
    if (isDialogOpen && editorRef.current?.view) {
      const position = editorRef.current.view.state.selection.main.head;

      if (position !== undefined) {
        setCursorPosition(position);
      }
    }
  }, [isDialogOpen]);

  // Function to handle inserting the prompt tag at the cursor position
  const handlePromptSelect = (tag: string) => {
    if (cursorPosition === null) return;

    // Insert the tag at the stored cursor position
    const newValue =
      value.substring(0, cursorPosition) +
      tag +
      value.substring(cursorPosition);

    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="relative">
      <CodeMirrorEditor
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        mode="prompt"
        minHeight={minHeight}
        className={className}
        editorRef={editorRef}
      />
      <Button
        type="button"
        variant="outline"
        className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1"
        onClick={() => setIsDialogOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        <span className="text-xs">Add prompt reference</span>
      </Button>

      {projectId && (
        <PromptSelectionDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSelect={handlePromptSelect}
          projectId={projectId}
        />
      )}
    </div>
  );
}
