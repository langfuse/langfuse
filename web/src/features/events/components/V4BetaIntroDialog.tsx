import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";

export function V4BetaIntroDialog({
  open,
  onConfirm,
}: {
  open: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onConfirm()}>
      <DialogContent
        className="[&>div:last-child]:hidden"
        aria-label="Welcome to a faster Langfuse"
      >
        <DialogBody>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/v4-beta-intro.png"
            alt="Langfuse gets Faster — performance comparison showing 5x to 165x speedups"
            className="w-full rounded-md"
          />
          <ul className="flex flex-col gap-3">
            <li className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Welcome to a faster Langfuse.
              </span>{" "}
              This is what you can expect:
            </li>
            <li className="text-sm text-muted-foreground">
              <span className="block font-medium text-foreground">
                Everything loads faster.
              </span>{" "}
              We&apos;ve rebuilt the data model around observations rather than
              traces, which means charts, filters, and APIs are dramatically
              faster, especially as your data grows.
            </li>
            <li className="text-sm text-muted-foreground">
              <span className="block font-medium text-foreground">
                Your traces are still here.
              </span>{" "}
              The default view now shows all observations. To see a table with
              just your root traces, filter by{" "}
              <span className="font-medium">
                Is Root Observation &rarr; True
              </span>
              . Tip: save that as an org-wide saved view so your whole team
              starts from the same place.
            </li>
            <li className="text-sm text-muted-foreground">
              <span className="block font-medium text-foreground">
                Saved views are now shared.
              </span>{" "}
              You can create and share views across your organization.
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            This is currently in beta. Things may look a little different as we
            roll it out.
          </p>
        </DialogBody>
        <DialogFooter className="items-center sm:justify-between">
          <a
            href="https://langfuse.com/docs/v4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            Read the v4 docs &rarr;
          </a>
          <Button onClick={onConfirm}>Got it, let&apos;s explore</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
