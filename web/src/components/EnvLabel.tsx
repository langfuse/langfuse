import { AlertTriangle, Check } from "lucide-react";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import { useSession } from "next-auth/react";

export const EnvLabel = ({ className }: { className?: string }) => {
  const session = useSession();
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;
  if (!session.data?.user?.email?.endsWith("@langfuse.com")) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 self-stretch rounded-md px-1 py-1 text-xs ring-1 sm:px-3 sm:py-2 lg:-mx-2",
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
          ? "bg-light-blue text-dark-blue ring-dark-blue"
          : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
            ? "bg-light-green text-dark-green ring-dark-green"
            : "bg-light-red text-dark-red ring-dark-red",
        className,
      )}
    >
      {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ? (
        <Check size={16} className="hidden sm:block" />
      ) : (
        <AlertTriangle size={16} className="hidden sm:block" />
      )}
      <span className="whitespace-nowrap">
        {["EU", "US"].includes(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
          ? `PROD-${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
          : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}
      </span>
    </div>
  );
};
