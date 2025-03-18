import { useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Separator } from "@/src/components/ui/separator";

export const TableWithMetadataWrapper = ({
  tableComponent,
  cardTitleChildren,
  cardContentChildren,
}: {
  tableComponent: ReactNode;
  cardTitleChildren: ReactNode;
  cardContentChildren: ReactNode;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={`grid flex-1 ${isCollapsed ? "grid-cols-[2fr,auto]" : "grid-cols-[2fr,1fr]"} gap-4 overflow-hidden`}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {tableComponent}
      </div>
      <div
        className={`flex flex-row ${isCollapsed ? "w-8" : "w-full"} h-full overflow-hidden`}
      >
        <div className="grid h-full w-full grid-cols-[auto,1fr] items-start gap-2 overflow-hidden">
          <div className="grid h-full w-full grid-rows-[auto,1fr] gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <ChevronRight
                className={`h-4 w-4 transform ${isCollapsed ? "rotate-180" : ""}`}
              />
            </Button>
            <Separator orientation="vertical" className="ml-4 h-full" />
          </div>
          <div
            className={`${isCollapsed ? "hidden" : "block"} grid max-h-full w-full grid-rows-[auto,1fr] overflow-hidden p-2`}
          >
            <div className="my-2 flex h-6 flex-wrap items-center gap-2 @container" />
            <Card className="flex h-full flex-col overflow-hidden">
              <CardHeader className="flex h-full w-full flex-col space-y-4">
                <CardTitle className="flex justify-between text-xl font-bold leading-7 sm:tracking-tight">
                  {cardTitleChildren}
                </CardTitle>
                <CardContent className="flex-1 space-y-4 overflow-y-auto p-0">
                  {cardContentChildren}
                </CardContent>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
