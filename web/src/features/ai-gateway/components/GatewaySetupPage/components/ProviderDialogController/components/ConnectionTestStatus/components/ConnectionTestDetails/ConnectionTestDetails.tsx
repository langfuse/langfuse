import { useState, type ComponentProps, type ReactNode } from "react";
import { Check, Copy } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

/** Popover with the provider's answer to a failed test; the caller supplies the trigger. */
export function ConnectionTestDetails({
  failure,
  children,
}: ConnectionTestDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { copy, isCopied } = useCopyToClipboard();
  const statusLabel = getStatusLabel(failure);

  const handleCopy = () => {
    copy(failure.body).catch(() => undefined);
  };
  const handleClose = () => setIsOpen(false);

  return (
    <FloatingController
      interaction="click"
      placement="top-start"
      sideOffset={8}
      open={isOpen}
      onOpenChange={setIsOpen}
      renderContent={(floatingProps) => (
        <div
          {...floatingProps}
          aria-label={failure.title}
          className="bg-popover text-popover-foreground flex w-96 flex-col gap-3 rounded-md border p-4 shadow-md outline-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">{failure.title}</span>
            {statusLabel ? (
              <Badge color="error" size="md" text={statusLabel} />
            ) : null}
          </div>
          {/* Provider answers can echo the configured host or parts of the key. */}
          <pre className="ph-no-capture bg-muted max-h-60 overflow-auto rounded-md p-3 font-mono text-xs wrap-break-word whitespace-pre-wrap">
            {failure.body || "The provider returned no details."}
          </pre>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              icon={isCopied ? Check : Copy}
              text={isCopied ? "Copied" : "Copy"}
              disabled={!failure.body}
              onClick={handleCopy}
            />
            <Button variant="text" text="Close" onClick={handleClose} />
          </div>
        </div>
      )}
    >
      {({ getTriggerProps }) => children({ getTriggerProps, isOpen })}
    </FloatingController>
  );
}

function getStatusLabel({ status, statusText }: ConnectionTestFailure) {
  if (status === null) return null;
  return statusText ? `${status} ${statusText}` : String(status);
}

type ConnectionTestDetailsProps = {
  failure: ConnectionTestFailure;
  children: (controls: TriggerControls & { isOpen: boolean }) => ReactNode;
};

type TriggerControls = Parameters<
  ComponentProps<typeof FloatingController>["children"]
>[0];

export type ConnectionTestFailure = {
  title: string;
  status: number | null;
  statusText: string | null;
  body: string;
};
