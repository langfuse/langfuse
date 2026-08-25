import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

export type VerifyResetPasswordButtonViewProps = {
  code: string;
  loading: boolean;
  onCodeChange: (code: string) => void;
  onVerify: () => void;
};

export function VerifyResetPasswordButtonView({
  code,
  loading,
  onCodeChange,
  onVerify,
}: VerifyResetPasswordButtonViewProps) {
  return (
    <div>
      <label htmlFor="otp-code" className="mb-2 block text-sm font-bold">
        Check your inbox for the code
      </label>
      <Input
        id="otp-code"
        type="number"
        minLength={6}
        maxLength={6}
        value={code}
        onChange={(event) => onCodeChange(event.target.value.trim())}
        placeholder="One time passcode"
        className="mb-8 w-full"
      />
      <Button
        onClick={onVerify}
        loading={loading}
        disabled={!code || code.length !== 6}
        className="w-full"
      >
        Verify code
      </Button>
    </div>
  );
}
