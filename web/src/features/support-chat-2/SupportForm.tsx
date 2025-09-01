import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
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

type MessageType = "Question" | "Feedback" | "Bug";

const TOPICS = [
  "Billing / Usage",
  "Account Changes",
  "Account Deletion",
  "Slack Connect Channel",
  "Inviting Users",
  "Tracing",
  "Prompt Management",
  "Evals",
  "Platform",
] as const;

const SEVERITIES = [
  "Question or feature request",
  "Feature not working as expected",
  "Feature is not working at all",
  "Outage, data loss, or data breach",
] as const;

export const SupportForm = ({
  mode,
  onModeChange,
  onClose,
}: {
  mode: "intro" | "form" | "success";
  onModeChange: (mode: "intro" | "form" | "success") => void;
  onClose: () => void;
}) => {
  const [messageType, setMessageType] = useState<MessageType>("Question");
  const [topic, setTopic] = useState<string>("");
  const [severity, setSeverity] = useState<string>(
    "Question or feature request",
  );
  const [message, setMessage] = useState("");

  const createTicket = api.supportChat2.createSupportThread.useMutation({
    onSuccess: () => {
      onModeChange("success");
    },
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
    <div className="h-full bg-background">
      <div className="p-2">
        <div className="mt-1 flex flex-col gap-4">
          {mode === "intro" ? (
            <>
              <div className="rounded-md border p-4">
                <div className="text-sm">Try our AI helper first</div>
                <div className="text-sm text-muted-foreground">
                  Get instant answers and examples.
                </div>
                <a
                  className="mt-2 inline-flex w-fit items-center text-sm font-medium text-primary underline"
                  href="https://langfuse.com/docs/ask-ai"
                  target="_blank"
                  rel="noopener"
                >
                  Ask AI
                </a>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <Button onClick={() => onModeChange("form")}>
                  Email a Support Engineer
                </Button>
                <div className="text-xs text-muted-foreground">
                  We usually reply within 1 business day. Please include enough
                  context to help us triage.
                </div>
              </div>
            </>
          ) : mode === "success" ? (
            <div className="space-y-3">
              <div className="rounded-md border p-4">
                <div className="text-sm font-medium">
                  Thanks for your message
                </div>
                <div className="text-sm text-muted-foreground">
                  We created a support ticket and will reply via email.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    onClose();
                  }}
                >
                  Close
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onModeChange("form");
                  }}
                >
                  Submit another
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <Label className="mb-2 block">Message Type</Label>
                <RadioGroup
                  value={messageType}
                  onValueChange={(v) => setMessageType(v as MessageType)}
                  className="grid grid-cols-3 gap-2"
                >
                  {(["Question", "Feedback", "Bug"] as MessageType[]).map(
                    (v) => (
                      <div
                        key={v}
                        className="flex items-center gap-2 rounded-md border p-2"
                      >
                        <RadioGroupItem value={v} id={`mt-${v}`} />
                        <Label htmlFor={`mt-${v}`}>{v}</Label>
                      </div>
                    ),
                  )}
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
                <Button variant="ghost" onClick={() => onModeChange("intro")}>
                  Back
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                We’ll email you at your account address. Replies may take up to
                one business day.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
