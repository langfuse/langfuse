import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogPortal,
  DialogBody,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import Link from "next/link";
import { Bug, Sparkles } from "lucide-react";

interface FeedbackDialogProps {
  className?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function FeedbackButtonWrapper({
  className,
  children,
  description = "What do you think about Langfuse? What can be improved? Please share it with the community on GitHub to shape the future of Langfuse.",
  title = "Provide Feedback",
}: FeedbackDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={className}
        asChild
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </DialogTrigger>
      <DialogPortal>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-row flex-wrap items-center justify-center gap-3 sm:justify-start">
              <Link href="https://langfuse.com/ideas" target="_blank">
                <Button variant="secondary">
                  <Sparkles className="mr-2 h-4 w-4" /> Submit Feature Request
                </Button>
              </Link>
              <Link href="https://langfuse.com/issues" target="_blank">
                <Button variant="secondary">
                  <Bug className="mr-2 h-4 w-4" /> Report a Bug
                </Button>
              </Link>
            </div>
          </DialogBody>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
