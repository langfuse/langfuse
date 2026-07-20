import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type CrashModalProps = {
  description: string;
  sentryEventId?: string;
  showReturnHome: boolean;
  statusCode?: number;
};

export const CrashModal = ({
  description,
  sentryEventId,
  showReturnHome,
  statusCode,
}: CrashModalProps) => {
  return (
    <div className="border-border bg-card w-full max-w-xl rounded-xl border p-6 shadow-sm sm:p-8">
      <div className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full">
        <CircleAlert className="size-5" aria-hidden="true" />
      </div>

      <div className="mt-4 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-5">
          {statusCode ? (
            <span className="text-foreground mr-2 font-bold whitespace-nowrap">
              Error {statusCode}
            </span>
          ) : null}
          {description}
        </p>

        {sentryEventId ? (
          <div className="border-border bg-muted/40 mt-5 rounded-lg border p-4">
            <dl>
              <div>
                <dt className="text-muted-foreground text-xs font-bold">
                  Error ID
                </dt>
                <dd className="mt-1.5 font-mono text-xs leading-5 break-all">
                  {sentryEventId}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {showReturnHome ? (
          <Button asChild className="mt-6">
            <Link href="/">Return home</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
};
