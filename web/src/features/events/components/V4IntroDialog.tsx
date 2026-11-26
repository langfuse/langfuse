/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  DialogTitle,
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
      {/* `[&>div:last-child]:hidden` suppresses DialogContent's floating close
          button; this dialog is dismissed through its footer action. The title
          below is an h2, so it is not caught by that selector. */}
      <DialogContent className="[&>div:last-child]:hidden">
        <DialogTitle className="sr-only">
          Welcome to a faster Langfuse
        </DialogTitle>
        <DialogBody>
          <img
            src="/assets/v4-beta-intro.jpg"
            alt="Langfuse gets Faster — performance comparison showing 5x to 165x speedups"
            className="w-full rounded-md"
          />
          <ul className="flex flex-col gap-3">
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-bold">
                Welcome to a faster Langfuse
              </span>{" "}
              We&apos;ve rebuilt the data model around observations rather than
              traces, which means charts, filters, and APIs are dramatically
              faster.
            </li>
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-bold">
                New Observations table
              </span>{" "}
              Your traces are still here. The default view now shows all
              observations. To see a table with just your root traces, filter by{" "}
              <span className="font-bold">Is Root Observation &rarr; True</span>
              .
            </li>
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-bold">
                New Saved Table Views
              </span>{" "}
              Save your table filters as an org-wide saved view so your whole
              team starts from the same place.{" "}
              <a
                href="https://langfuse.com/faq/all/explore-observations-in-v4"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-bold hover:underline"
              >
                Best practices &rarr;
              </a>
            </li>
          </ul>
          <div className="mt-3">
            <Banner
              variant="warning"
              title="Want traces to appear live?"
              actions={[
                {
                  text: "Upgrade guide",
                  href: "https://langfuse.com/docs/observability/sdk/upgrade-path",
                },
              ]}
            >
              Upgrade your SDK to the latest version. Older SDKs still work but
              traces may take ~10 minutes to appear.
            </Banner>
          </div>
        </DialogBody>
        <DialogFooter className="items-center sm:justify-between">
          <a
            href="https://langfuse.com/docs/v4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm font-bold hover:underline"
          >
            Read the v4 docs &rarr;
          </a>
          <Button onClick={onConfirm}>Understood &rarr;</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
