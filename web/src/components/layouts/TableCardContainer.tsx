import { Card } from "@/src/components/ui/card";

export const TableCardContainer = ({
  children,
  stretch = false,
}: {
  children: React.ReactNode;
  stretch?: boolean;
}) => {
  return (
    <Card
      className={`flex flex-col overflow-hidden [&>:first-child>:first-child]:border-t-0 ${stretch ? "grow" : "max-h-[60dvh]"}`}
    >
      {children}
    </Card>
  );
};
