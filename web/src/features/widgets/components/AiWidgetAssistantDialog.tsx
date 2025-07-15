import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";

interface AiWidgetAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (description: string) => void;
  isGenerating: boolean;
}

export function AiWidgetAssistantDialog({
  open,
  onOpenChange,
  onGenerate,
  isGenerating,
}: AiWidgetAssistantDialogProps) {
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (description.trim()) {
      onGenerate(description.trim());
      setDescription("");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Widget Assistant
          </DialogTitle>
          <DialogDescription>
            Describe the widget you want to create, and AI will help configure
            it for you.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Example: Show me a line chart of trace count over time for the last 30 days, grouped by model"
            className="min-h-[100px]"
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Widget
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
