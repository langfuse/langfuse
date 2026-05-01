import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";

export function V4IntroDialog({
  open,
  onConfirm,
  onDismiss,
}: {
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent
        className="[&>div:last-child]:hidden"
        aria-label="Welcome to a faster Langfuse"
      >
        <DialogBody>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/v4-beta-intro.jpg"
            alt="Langfuse gets Faster — performance comparison showing 5x to 165x speedups"
            className="w-full rounded-md"
          />
          <ul className="flex flex-col gap-3">
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-medium">
                Welcome to a faster Langfuse
              </span>{" "}
              We&apos;ve rebuilt the data model around observations rather than
              traces, which means charts, filters, and APIs are dramatically
              faster.
            </li>
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-medium">
                New Observations table
              </span>{" "}
              Your traces are still here. The default view now shows all
              observations. To see a table with just your root traces, filter by{" "}
              <span className="font-medium">
                Is Root Observation &rarr; True
              </span>
              .
            </li>
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-medium">
                New Saved Table Views
              </span>{" "}
              Save your table filters as an org-wide saved view so your whole
              team starts from the same place.{" "}
              <a
                href="https://langfuse.com/faq/all/explore-observations-in-v4"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                Best practices &rarr;
              </a>
            </li>
          </ul>
          <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950">
            <p className="text-yellow-900 dark:text-yellow-200">
              <span className="font-medium">Want traces to appear live?</span>{" "}
              Upgrade your SDK to the latest version. Older SDKs still work but
              traces may take ~10 minutes to appear.{" "}
              <a
                href="https://langfuse.com/docs/observability/sdk/upgrade-path"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:no-underline"
              >
                Upgrade guide &rarr;
              </a>
            </p>
          </div>
        </DialogBody>
        <DialogFooter className="items-center sm:justify-between">
          <a
            href="https://langfuse.com/docs/v4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm font-medium hover:underline"
          >
            Read the v4 docs &rarr;
          </a>
          <Button onClick={onConfirm}>Understood &rarr;</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
