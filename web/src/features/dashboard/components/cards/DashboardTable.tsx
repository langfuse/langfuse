import { ExpandListButton } from "@/src/features/dashboard/components/cards/ChevronButton";
import { type ReactNode, useState } from "react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useFitRowCount } from "@/src/features/dashboard/hooks/useFitRowCount";

// Approximate rendered height of one <tr> (py-2 + text-xs) and of the sticky
// header row, used to decide how many rows fit in the tile. (LFE-11035)
const TABLE_ROW_HEIGHT = 33;
const TABLE_HEADER_HEIGHT = 45;

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

  // Fit the number of rows to the tile height: by default render exactly the
  // rows that fill the measured area (no scrollbar), and let "Show all" reveal
  // the rest (scrolling within the tile). Falls back to the old fixed count
  // before the first measurement. (LFE-11035)
  const { containerRef, rowCount } = useFitRowCount({
    rowHeightPx: TABLE_ROW_HEIGHT,
    reservedPx: TABLE_HEADER_HEIGHT,
    min: 1,
    fallback: collapse?.collapsed ?? rows.length,
  });

  const collapsedCount = collapse ? Math.min(rowCount, rows.length) : undefined;
  const visibleRows = rows.slice(
    0,
    collapse ? (isExpanded ? collapse.expanded : collapsedCount) : undefined,
  );

  return (
    <>
      {children}
      {rows.length > 0 ? (
        // Fill the leftover card height so the table can size itself to the
        // tile; the row area scrolls only once expanded past what fits, while
        // the "Show all" button stays pinned below. (LFE-11035)
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div
            ref={containerRef}
            className="min-h-0 flex-1 overflow-x-auto overflow-y-auto"
          >
            <div className="inline-block min-w-full align-middle">
              <table className="divide-border animate-in animate-out min-w-full divide-y">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="text-primary py-3.5 pr-3 pl-4 text-left text-xs font-bold whitespace-nowrap sm:pl-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-accent divide-y">
                  {visibleRows.map((row, i) => (
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
              maxLength={collapsedCount ?? collapse.collapsed}
              expandText={
                rows.length > collapse.expanded
                  ? `Show top ${collapse.expanded}`
                  : "Show all"
              }
            />
          ) : null}
        </div>
      ) : (
        // Fills leftover tile height inside the card's flex column. (LFE-10813)
        <NoDataOrLoading
          isLoading={isLoading}
          {...noDataProps}
          className="h-auto grow"
        />
      )}
    </>
  );
};
