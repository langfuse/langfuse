import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";

export function ManageDefaultEvalModel({
  projectId,
  setUpMessage,
  variant = "default",
  showEditButton = true,
  className,
}: {
  projectId: string;
  setUpMessage?: string;
  variant?: "default" | "color-coded";
  showEditButton?: boolean;
  className?: string;
}) {
  const hasDefaultModelReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:read",
  });
  const hasDefaultModelWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });

  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: hasDefaultModelReadAccess },
  );

  return (
    <div className="flex items-center">
      {!showEditButton &&
        (defaultModel ? (
          <Check className="mr-2 h-4 w-4 text-dark-green" />
        ) : (
          <TriangleAlert className="mr-2 h-4 w-4 text-dark-yellow" />
        ))}
      {defaultModel ? (
        <span
          className={cn(
            "text-sm font-medium",
            variant === "color-coded" && "text-dark-green",
            className,
          )}
        >
          {"Current default model: "}
          {defaultModel.provider} / {defaultModel.model}
        </span>
      ) : (
        <span
          className={cn(
            "text-sm font-medium",
            variant === "color-coded" && "text-dark-yellow",
            className,
          )}
        >
          {setUpMessage ?? "No default model set"}
        </span>
      )}
      {showEditButton && (
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          asChild
          disabled={!hasDefaultModelWriteAccess}
        >
          <Link
            href={`/project/${projectId}/evals/default-model`}
            target="_blank"
          >
            <Pencil
              className={cn(
                "h-3 w-3",
                variant === "color-coded" &&
                  !defaultModel &&
                  "text-dark-yellow",
              )}
            />
          </Link>
        </Button>
      )}
    </div>
  );
}
