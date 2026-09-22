// PROTOTYPE — throwaway. Permission matrix with read-first action columns, per set.

import { Check } from "lucide-react";

import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { cn } from "@/src/utils/tailwind";
import {
  type PermissionDomain,
  kindsForDomain,
  orderActions,
  permissionDomains,
  permissionId,
} from "./permissionCatalog";

export const PermissionMatrix = ({
  granted,
  editable,
  onToggle,
}: {
  granted: Set<string>;
  editable: boolean;
  onToggle: (id: string) => void;
}) => (
  <div className="flex flex-col gap-4">
    {permissionDomains.map((domain) => (
      <div key={domain.key} className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          {domain.label}
        </span>
        <DomainMatrix
          domain={domain.key}
          granted={granted}
          editable={editable}
          onToggle={onToggle}
        />
      </div>
    ))}
  </div>
);

const DomainMatrix = ({
  domain,
  granted,
  editable,
  onToggle,
}: {
  domain: PermissionDomain;
  granted: Set<string>;
  editable: boolean;
  onToggle: (id: string) => void;
}) => {
  const kinds = kindsForDomain(domain);
  const columns = orderActions([...new Set(kinds.flatMap((k) => k.actions))]);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b">
            <th className="bg-muted sticky left-0 z-10 w-48 max-w-48 min-w-48 px-3 py-2 text-left font-bold">
              Resource
            </th>
            {columns.map((a) => (
              <th key={a} className="px-3 py-2 text-center font-bold">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kinds.map((kind) => (
            <tr key={kind.resource} className="border-b last:border-0">
              <td className="bg-card sticky left-0 z-10 w-48 max-w-48 min-w-48 px-3 py-2 font-bold">
                {kind.label}
              </td>
              {columns.map((a) => (
                <td key={a} className="px-3 py-2 text-center">
                  <MatrixCell
                    supported={kind.actions.includes(a)}
                    granted={granted.has(
                      permissionId(kind.domain, kind.resource, a),
                    )}
                    editable={editable}
                    onToggle={() =>
                      onToggle(permissionId(kind.domain, kind.resource, a))
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MatrixCell = ({
  supported,
  granted,
  editable,
  onToggle,
}: {
  supported: boolean;
  granted: boolean;
  editable: boolean;
  onToggle: () => void;
}) => {
  if (!supported)
    return <span className="text-muted-foreground/30 select-none">–</span>;
  if (editable)
    return (
      <div className="flex justify-center">
        <Checkbox checked={granted} onCheckedChange={onToggle} />
      </div>
    );
  return (
    <div className="flex justify-center">
      <Check
        className={cn(
          "h-4 w-4",
          granted ? "text-primary" : "text-muted-foreground/20",
        )}
      />
    </div>
  );
};
