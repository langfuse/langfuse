import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/src/utils/tailwind";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  allowPasswordManager?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ allowPasswordManager = false, className, type, ...props }, ref) => {
    return (
      <input
        {...(!allowPasswordManager && { "data-1p-ignore": true })}
        className={cn(
          "border-input bg-background placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/30 flex h-8 w-full min-w-0 appearance-none rounded-md border px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
