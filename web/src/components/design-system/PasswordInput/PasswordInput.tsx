import { useState, type InputHTMLAttributes, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "aria-describedby"
  | "aria-invalid"
  | "aria-label"
  | "aria-labelledby"
  | "autoComplete"
  | "autoFocus"
  | "defaultValue"
  | "disabled"
  | "id"
  | "name"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "placeholder"
  | "readOnly"
  | "required"
  | "tabIndex"
  | "value"
> & {
  ref?: Ref<HTMLInputElement>;
};

export function PasswordInput({ ref, disabled, ...props }: PasswordInputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={isPasswordVisible ? "text" : "password"}
        disabled={disabled}
        className="border-input bg-background ring-offset-background placeholder:text-foreground-tertiary focus-visible:ring-ring flex h-8 w-full rounded-md border px-3 py-2 pr-10 text-sm file:border-0 file:bg-transparent file:text-sm file:font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        aria-label={isPasswordVisible ? "Hide password" : "Show password"}
        aria-pressed={isPasswordVisible}
        disabled={disabled}
        className="absolute top-1/2 right-3 -translate-y-1/2 transform cursor-pointer disabled:cursor-not-allowed"
        onClick={() => setIsPasswordVisible((visible) => !visible)}
      >
        {isPasswordVisible ? (
          <EyeOff
            aria-hidden="true"
            className="text-muted-foreground h-5 w-5"
          />
        ) : (
          <Eye aria-hidden="true" className="text-muted-foreground h-5 w-5" />
        )}
      </button>
    </div>
  );
}
