import { Card } from "@/src/components/ui/card";

export const TableCardContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Card className="flex max-h-[60dvh] flex-col overflow-hidden [&>:first-child>:first-child]:border-t-0">
      {children}
    </Card>
  );
};
