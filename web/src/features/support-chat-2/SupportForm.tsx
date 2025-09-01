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
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [messageType, setMessageType] = useState<MessageType>("Question");
  const [topic, setTopic] = useState<(typeof TOPICS)[number] | undefined>();
  const [severity, setSeverity] = useState<
    (typeof SEVERITIES)[number] | undefined
  >();
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const createTicket = api.supportChat2.createSupportThread.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const submit = () => {
    if (!topic || !severity || message.trim().length === 0) return;
    createTicket.mutate({ messageType, topic, severity, message });
  };

  const resetState = () => {
    setShowForm(false);
    setMessage("");
    setTopic(undefined);
    setSeverity(undefined);
    setMessageType("Question");
    setSubmitted(false);
  };

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) resetState();
  };

  if (!open) return null;

  return (
    <div className="h-full w-[540px] border-l bg-background sm:w-[600px]">
      <div className="p-4">
        <div className="text-lg font-semibold">Contact Support</div>
        <div className="mt-4 flex flex-col gap-4">
          {!showForm && !submitted ? (
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
                <Button onClick={() => setShowForm(true)}>
                  Email a Support Engineer
                </Button>
                <div className="text-xs text-muted-foreground">
                  We usually reply within 1 business day. Please include enough
                  context to help us triage.
                </div>
              </div>
            </>
          ) : submitted ? (
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
                    handleOpenChange(false);
                  }}
                >
                  Close
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSubmitted(false);
                    setShowForm(true);
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
                <Select value={topic} onValueChange={(v) => setTopic(v as any)}>
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
                <Select
                  value={severity}
                  onValueChange={(v) => setSeverity(v as any)}
                >
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
                    !topic ||
                    !severity ||
                    message.trim().length === 0 ||
                    createTicket.isPending
                  }
                >
                  {createTicket.isPending ? "Submitting..." : "Submit"}
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>
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
