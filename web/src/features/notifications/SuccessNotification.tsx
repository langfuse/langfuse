import { ActionButton } from "@/src/components/ActionButton";
import { BadgeCheck, X } from "lucide-react";

export type SuccessNotificationProps = {
  title: string;
  description: string;
  onDismiss: () => void;
  link?: {
    href: string;
    text: string;
  };
};

export const SuccessNotification: React.FC<SuccessNotificationProps> = ({
  title,
  description,
  onDismiss,
  link,
}) => {
  return (
    <div className="flex justify-between">
      <div className="flex min-w-[300px] flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <BadgeCheck size={20} className="text-primary-foreground" />
          <div className="m-0 text-sm font-medium leading-tight text-primary-foreground">
            {title}
          </div>
        </div>
        {description && (
          <div className="text-sm leading-tight text-primary-foreground">
            {description}
          </div>
        )}
        {link && (
          <ActionButton
            href={link.href}
            size="sm"
            variant="secondary"
            className="self-start"
          >
            {link.text}
          </ActionButton>
        )}
      </div>
      <button
        className="flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 text-primary-foreground transition-colors duration-200"
        onClick={onDismiss}
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
