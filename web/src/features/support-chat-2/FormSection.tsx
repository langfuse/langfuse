import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/utils/api";
import { type MessageType, SEVERITIES, TOPICS } from "./formConstants";

export function FormSection({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [messageType, setMessageType] = useState<MessageType>("Question");
  const [topic, setTopic] = useState<string>("");
  const [severity, setSeverity] = useState<string>(
    "Question or feature request",
  );
  const [message, setMessage] = useState("");

  const createTicket = api.supportChat2.createSupportThread.useMutation({
    onSuccess: () => onSuccess(),
  });

  const submit = () => {
    if (!topic || !severity || message.trim().length === 0) return;
    createTicket.mutate({
      messageType,
      topic: topic as any,
      severity: severity as any,
      message,
    });
  };

  return (
    <div className="mt-1 flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        A few details help us route your request and get you the fastest, most
        helpful response.
      </p>
      <div>
        <Label className="mb-2 block">Message Type</Label>
        <RadioGroup
          value={messageType}
          onValueChange={(v) => setMessageType(v as MessageType)}
          className="grid grid-cols-3 gap-2"
        >
          {["Question", "Feedback", "Bug"].map((v) => (
            <div
              key={v}
              className="flex items-center gap-2 rounded-md border p-2"
            >
              <RadioGroupItem value={v} id={`mt-${v}`} />
              <Label htmlFor={`mt-${v}`} className="truncate">
                {v}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label className="mb-2 block">Severity</Label>
        <Select value={severity} onValueChange={(v) => setSeverity(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2 block">Topic</Label>
        <Select value={topic} onValueChange={(v) => setTopic(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a topic" />
          </SelectTrigger>
          <SelectContent>
            <div className="p-2">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Operations
              </div>
              {TOPICS.Operations.map((t) => (
                <SelectItem key={t} value={t} className="pl-2">
                  {t}
                </SelectItem>
              ))}
            </div>
            <div className="border-t p-2">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Product Features
              </div>
              {TOPICS["Product Features"].map((t) => (
                <SelectItem key={t} value={t} className="pl-2">
                  {t}
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2 block">Message</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            "Please explain as fully as possible what you're aiming to do, and what you'd like help with.\n\nIf your question involves an existing insight or dashboard, please include a link to it."
          }
          rows={8}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={submit}
          disabled={
            topic.trim().length === 0 ||
            !severity ||
            message.trim().length === 0 ||
            createTicket.isPending
          }
          className="w-full"
        >
          {createTicket.isPending ? "Submitting..." : "Submit"}
        </Button>
        <Button variant="ghost" onClick={onBack} className="w-full">
          Cancel
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        We will email you at your account address. Replies may take up to one
        business day.
      </div>
    </div>
  );
}
