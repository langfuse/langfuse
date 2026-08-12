// CIP fork feature (see FORK.md): share popover with the public form URL.
// Prompts to publish first while the elicitation is still a draft.
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { type ElicitationStatus } from "../../lib/contract";

export function publicFormUrl(elicitationId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/public/forms/${elicitationId}`;
}

export function ShareButton({
  elicitationId,
  status,
  onPublish,
  publishPending,
}: {
  elicitationId: string;
  status: ElicitationStatus;
  onPublish: () => void;
  publishPending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = publicFormUrl(elicitationId);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="mr-1 h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        {status === "draft" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              This elicitation hasn&apos;t been published yet. Publish it to get
              a public link respondents can open without signing in.
            </p>
            <Button size="sm" onClick={onPublish} disabled={publishPending}>
              Publish now
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Public form link</p>
            {status === "closed" && (
              <p className="text-xs text-muted-foreground">
                The form is closed — visitors currently see the closed message.
              </p>
            )}
            <div className="flex gap-1">
              <Input readOnly value={url} className="h-8 text-xs" />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={copy}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-dark-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="sr-only">Copy link</span>
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
