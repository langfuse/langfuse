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
      className={`grid h-[calc(100dvh-8rem)] ${isCollapsed ? "grid-cols-[2fr,auto]" : "grid-cols-[2fr,1fr]"} gap-4 overflow-hidden lg:h-[calc(100dvh-4rem)]`}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {tableComponent}
      </div>
      <div
        className={`my-2 flex flex-row ${isCollapsed ? "w-8" : "w-full"} h-full overflow-hidden`}
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
            className={`${isCollapsed ? "hidden" : "block"} mt-8 grid h-[calc(100%-2rem)] w-full grid-rows-[auto,1fr] gap-2 overflow-hidden p-2`}
          >
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="flex h-full overflow-y-auto">
                <CardHeader className="flex h-full w-full flex-col space-y-4">
                  <CardTitle className="flex justify-between text-xl font-bold leading-7 sm:tracking-tight">
                    {cardTitleChildren}
                  </CardTitle>
                  <CardContent className="flex-1 space-y-4 p-0">
                    {cardContentChildren}
                  </CardContent>
                </CardHeader>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
