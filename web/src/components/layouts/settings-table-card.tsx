import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";

export const SettingsTableCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <Card
      className={cn(
        "mb-4 flex max-h-[60dvh] flex-col overflow-hidden [&>:first-child>:first-child]:border-t-0",
        className,
      )}
    >
      {children}
    </Card>
  );
};
