import * as React from "react";

import { cn } from "@/src/utils/tailwind";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  allowPasswordManager?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, allowPasswordManager = false, ...props }, ref) => {
    return (
      <input
        {...(!allowPasswordManager && { "data-1p-ignore": true })}
        type={type}
        className={cn(
          "flex h-8 w-full min-w-14 rounded-md border border-input bg-background px-2 py-1 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
