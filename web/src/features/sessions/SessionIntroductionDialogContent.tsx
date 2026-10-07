import { Button } from "@/src/components/ui/button";
import { Close } from "@radix-ui/react-dialog";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { env } from "@/src/env.mjs";

export function SessionIntroductionDialogContent({
  onAfterButtonClick,
}: {
  onAfterButtonClick: (button: "got_it" | "provide_feedback") => void;
}) {
  const handleFeedbackClick = () => {
    onAfterButtonClick("provide_feedback");
  };

  const handleGotItClick = () => {
    onAfterButtonClick("got_it");
  };

  return (
    <Dialog title="The new session view" closeOnInteractionOutside>
      <Dialog.Body>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/session-transcripts-intro.png`}
          alt="Session conversation transcript with user and assistant messages and a sidebar for navigating traces and messages"
          className="-mt-2 max-h-72 w-full rounded-md border object-contain"
        />
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">What&apos;s new:</strong> Read
          user and assistant messages across traces in one continuous
          conversation transcript. Use the new conversation sidebar to follow
          the trajectory of the conversation, get an overview of the tools used,
          and jump to any message or trace. Messages are extracted from your
          observations automatically. If the conversation doesn&apos;t look
          right or messages are missing, please use the feedback button below to
          let us know.
        </p>
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">What&apos;s removed:</strong>{" "}
          Sessions now focus on messages rather than individual observations, so
          saved views and observation-based filtering have been removed from the
          session view.
        </p>
      </Dialog.Body>
      <div className="flex shrink-0 justify-end gap-2 p-4">
        <Button variant="outline" asChild>
          <a
            href="https://github.com/langfuse/langfuse/discussions"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleFeedbackClick}
          >
            Provide feedback
          </a>
        </Button>
        <Close asChild>
          <Button onClick={handleGotItClick}>Got it!</Button>
        </Close>
      </div>
    </Dialog>
  );
}
