import { type ReactNode } from "react";

/** Centered icon, title, sentence and actions for empty and error states. */
export function TopicsCenteredState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 pb-44">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        {icon}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-muted-foreground text-sm text-balance break-words">
            {body}
          </p>
        </div>
        {children ? <div className="flex gap-2">{children}</div> : null}
      </div>
    </div>
  );
}
