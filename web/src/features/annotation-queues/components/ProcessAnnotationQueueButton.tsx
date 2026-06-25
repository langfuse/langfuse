import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ChevronDown, ClipboardPen, Lock } from "lucide-react";
import Link from "next/link";

export const ProcessAnnotationQueueButton = ({
  projectId,
  queueId,
  disabled,
  size = "default",
}: {
  projectId: string;
  queueId: string;
  disabled?: boolean;
  size?: ButtonProps["size"];
}) => {
  const iconClassName = size === "sm" ? "mr-1 h-3 w-3" : "mr-1 h-4 w-4";
  const labelClassName = size === "sm" ? "text-xs" : "text-sm";
  const baseHref = `/project/${projectId}/annotation-queues/${queueId}/items`;

  if (disabled) {
    return (
      <Button size={size} disabled>
        <Lock className={iconClassName} />
        <span className={labelClassName}>Process queue</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size}>
          <ClipboardPen className={iconClassName} />
          <span className={labelClassName}>Process queue</span>
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`${baseHref}?order=asc`}>Oldest first</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`${baseHref}?order=desc`}>Newest first</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
