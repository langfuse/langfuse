import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export const NoAccessError = () => {
  const session = useSession();
  const router = useRouter();

  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h1 className="mb-4 text-xl font-bold">Error</h1>
      <p className="mb-8 text-center">
        You do not have access to this resource.
      </p>
      {session.status === "unauthenticated" ? (
        <Button onClick={() => void router.push("/")}>Sign In</Button>
      ) : null}
    </div>
  );
};
