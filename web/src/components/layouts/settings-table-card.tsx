import { Card } from "@/src/components/ui/card";

export const SettingsTableCard = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Card className="mb-4 flex max-h-[60dvh] flex-col overflow-hidden [&>:first-child>:first-child]:border-t-0">
      {children}
    </Card>
  );
};
