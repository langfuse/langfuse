import * as React from "react";

import { Button } from "@/src/components/ui/button";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { cn } from "@/src/utils/tailwind";
import { Check, Copy } from "lucide-react";

type TableDensity = "compact" | "comfortable";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table
    ref={ref}
    className={cn(
      "w-full table-fixed caption-bottom border-separate border-spacing-0 space-y-4 overflow-auto text-sm",
      className,
    )}
    {...props}
  />
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("text-xs [&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "bg-muted/50 border-t font-medium last:[&>tr]:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "bg-background text-muted-foreground relative h-10 border-b px-2 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { density?: TableDensity }
>(({ className, density = "compact", ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-full align-middle [&:has([role=checkbox])]:pr-0",
      density === "comfortable" ? "p-2" : "px-2 py-0",
      "border-b [:last-child_>_&]:border-b-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

type TableCellWithCopyButtonProps =
  React.TdHTMLAttributes<HTMLTableCellElement> & {
    text: string;
    density?: TableDensity;
    copyButtonLabel?: string;
  };

const TableCellWithCopyButton = React.forwardRef<
  HTMLTableCellElement,
  TableCellWithCopyButtonProps
>(({ text, copyButtonLabel, className, ...props }, ref) => {
  const { copy, isCopied } = useCopyToClipboard();

  return (
    <TableCell
      ref={ref}
      className={cn("relative min-w-0 pr-10", className)}
      title={text}
      {...props}
    >
      {text}
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1/2 right-2 -translate-y-1/2"
        title={copyButtonLabel ?? "Copy to clipboard"}
        aria-label={copyButtonLabel ?? "Copy to clipboard"}
        onClick={async (event) => {
          event.preventDefault();
          const button = event.currentTarget;
          try {
            await copy(text);
          } catch {
            // Clipboard writes can be rejected when the browser denies permission.
          }

          if (button) {
            // The original button might no longer be in the DOM if React re-rendered the component after the state update.
            button.focus();
          }
        }}
      >
        {isCopied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </TableCell>
  );
});
TableCellWithCopyButton.displayName = "TableCellWithCopyButton";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("text-muted-foreground mt-4 text-sm", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCellWithCopyButton,
  TableCaption,
};
