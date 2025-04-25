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
        "flex items-center gap-1 self-stretch whitespace-nowrap rounded-md px-1 py-0.5 text-xs",
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
          ? "bg-light-blue text-dark-blue"
          : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
            ? "bg-light-green text-dark-green"
            : "bg-light-red text-dark-red",
        className,
      )}
    >
      {["EU", "US", "HIPAA"].includes(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
        ? `PROD-${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
        : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}
    </div>
  );
};
