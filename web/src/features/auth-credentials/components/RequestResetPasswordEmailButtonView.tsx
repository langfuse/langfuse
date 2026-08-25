import { Button } from "@/src/components/ui/button";

export type RequestResetPasswordEmailButtonViewProps = {
  buttonLabel: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
};

export function RequestResetPasswordEmailButtonView({
  buttonLabel,
  disabled,
  loading,
  onClick,
}: RequestResetPasswordEmailButtonViewProps) {
  return (
    <Button onClick={onClick} loading={loading} disabled={disabled}>
      {buttonLabel}
    </Button>
  );
}
