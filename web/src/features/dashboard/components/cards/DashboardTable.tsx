import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { useState, type ReactNode } from "react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

type TableHeaders = ReactNode[];
type TableRows = ReactNode[][];
type DashboardTableProps = {
  headers: TableHeaders;
  rows: TableRows;
  children?: ReactNode;
  collapse?: {
    collapsed: number;
    expanded: number;
  };
  noDataProps?: {
    description: string;
    href: string;
  };
  isLoading: boolean;
};

export const DashboardTable = ({
  headers,
  rows,
  children,
  collapse,
  noDataProps,
  isLoading,
}: DashboardTableProps) => {
  const [isExpanded, setExpanded] = useState(false);
  return (
    <>
      {children}
      {rows.length > 0 ? (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <table className="divide-border animate-in animate-out min-w-full divide-y">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="text-primary py-3.5 pr-3 pl-4 text-left text-xs font-semibold whitespace-nowrap sm:pl-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-accent bg-background divide-y">
                  {rows
                    .slice(
                      0,
                      collapse
                        ? isExpanded
                          ? collapse.expanded
                          : collapse.collapsed
                        : undefined,
                    )
                    .map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="text-muted-foreground py-2 pr-2 pl-3 text-xs whitespace-nowrap sm:pl-0"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          {collapse ? (
            <ExpandListButton
              isExpanded={isExpanded}
              setExpanded={setExpanded}
              totalLength={rows.length}
              maxLength={collapse.collapsed}
              expandText={
                rows.length > collapse.expanded
                  ? `Show top ${collapse.expanded}`
                  : "Show all"
              }
            />
          ) : null}
        </div>
      ) : (
        <NoDataOrLoading isLoading={isLoading} {...noDataProps} />
      )}
    </>
  );
};
