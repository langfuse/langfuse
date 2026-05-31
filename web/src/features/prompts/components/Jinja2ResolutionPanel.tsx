import { useState, useMemo } from "react";
import nunjucks from "nunjucks";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Badge } from "@/src/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

const env = new nunjucks.Environment(null as any, {
  autoescape: false,
  throwOnUndefined: false,
});

type Props = {
  template: string;
  variables: string[];
};

export const Jinja2ResolutionPanel = ({ template, variables }: Props) => {
  const [isOpen, setIsOpen] = useState(true);
  const [varValues, setVarValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v, ""])),
  );
  const [errors, setErrors] = useState<string[]>([]);

  // Sync new variables when template changes
  useMemo(() => {
    setVarValues((prev) => {
      const next: Record<string, string> = {};
      for (const v of variables) {
        next[v] = prev[v] ?? "";
      }
      return next;
    });
  }, [variables]);

  const allEmpty = useMemo(
    () => Object.values(varValues).every((v) => v === ""),
    [varValues],
  );

  const compiled = useMemo(() => {
    // When no values have been entered yet, show the raw template so users can
    // see the full structure (all {% if %} / {% for %} blocks) before filling in.
    if (allEmpty) {
      setErrors([]);
      return template;
    }
    try {
      // Parse JSON values
      const parsed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(varValues)) {
        try {
          parsed[k] = JSON.parse(v);
        } catch {
          parsed[k] = v;
        }
      }
      const result = env.renderString(template, parsed);

      setErrors([]);
      return result.trim() === "" ? template : result;
    } catch (e) {
      setErrors([String(e)]);
      return template;
    }
  }, [template, varValues, allEmpty]);

  if (variables.length === 0) return null;

  return (
    <div className="rounded-md border">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span>Compiled Preview</span>
          {errors.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {errors.length} error{errors.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t px-3 pt-2 pb-3">
          {/* Variable inputs */}
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {variables.map((variable) => (
              <div key={variable} className="flex flex-col gap-1">
                <Label className="text-muted-foreground text-xs">
                  {variable}
                </Label>
                <Input
                  className="h-7 text-xs"
                  placeholder={`Value for {{${variable}}}`}
                  value={varValues[variable] ?? ""}
                  onChange={(e) =>
                    setVarValues((prev) => ({
                      ...prev,
                      [variable]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          {/* Error messages */}
          {errors.length > 0 && (
            <div className="bg-destructive/10 text-destructive mb-2 rounded px-2 py-1 text-xs">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          {/* Compiled output */}
          <CodeView content={compiled} title="Compiled Output" />
        </div>
      )}
    </div>
  );
};
