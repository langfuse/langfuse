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
              <table className="min-w-full divide-y divide-border animate-in animate-out">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="whitespace-nowrap py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-primary sm:pl-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-accent bg-background">
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
                            className="whitespace-nowrap py-2 pl-3 pr-2 text-xs text-muted-foreground sm:pl-0"
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
