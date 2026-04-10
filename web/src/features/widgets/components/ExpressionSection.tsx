import React from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import {
  ALLOWED_FUNCTIONS,
  validateExpression,
} from "@/src/features/widgets/components/widgetExpressionParser";

export interface ExpressionConfig {
  id: string;
  name: string;
  expression: string;
  expanded: boolean;
}

export function ExpressionSection({
  config,
  availableVars,
  onChange,
  onRemove,
}: {
  config: ExpressionConfig;
  availableVars: string[];
  onChange: (config: ExpressionConfig) => void;
  onRemove: () => void;
}) {
  const validation = validateExpression(config.expression, availableVars);

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex-none"
          onClick={() => onChange({ ...config, expanded: !config.expanded })}
        >
          {config.expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <p className="text-muted-foreground flex-1 text-xs font-semibold tracking-wide">
          {"∑ Expression"}
          {config.name && <>: {config.name}</>}
        </p>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive flex-none"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={config.expanded ? "mt-4 space-y-4" : "hidden"}>
        {/* Display Name */}
        <div className="space-y-2">
          <Label>Display Name</Label>
          <Input
            value={config.name}
            onChange={(e) => onChange({ ...config, name: e.target.value })}
            placeholder="Expression (default)"
          />
        </div>

        {/* Expression */}
        <div className="space-y-2">
          <Label>Expression</Label>
          <p className="text-muted-foreground text-xs">
            Variables:{" "}
            {availableVars.length > 0 ? availableVars.join(", ") : "none yet"}.{" "}
            Functions: {[...ALLOWED_FUNCTIONS].join(", ")}. Operators: +, −, ×,
            ÷.
          </p>
          <Input
            value={config.expression}
            onChange={(e) =>
              onChange({ ...config, expression: e.target.value })
            }
            placeholder={
              availableVars.length >= 2
                ? `e.g. a / (a + b) * 100`
                : `e.g. abs(a)`
            }
            className={
              !validation.valid && config.expression.trim()
                ? "border-destructive"
                : ""
            }
          />
          {!validation.valid && config.expression.trim() && (
            <p className="text-destructive text-xs">{validation.reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
