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
    <div className="mt-1 flex flex-col gap-4">
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
              <Label htmlFor={`mt-${v}`}>{v}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label className="mb-2 block">Topic</Label>
        <Select value={topic} onValueChange={(v) => setTopic(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a topic" />
          </SelectTrigger>
          <SelectContent>
            {TOPICS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <div className="flex items-center gap-2">
        <Button
          onClick={submit}
          disabled={
            topic.trim().length === 0 ||
            !severity ||
            message.trim().length === 0 ||
            createTicket.isPending
          }
        >
          {createTicket.isPending ? "Submitting..." : "Submit"}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        We’ll email you at your account address. Replies may take up to one
        business day.
      </div>
    </div>
  );
}
