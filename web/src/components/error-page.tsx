import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export const ErrorPage = ({
  title = "Error",
  message,
}: {
  title?: string;
  message: string;
}) => {
  const session = useSession();
  const router = useRouter();

  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h1 className="mb-4 text-xl font-bold">{title}</h1>
      <p className="mb-8 text-center">{message}</p>
      {session.status === "unauthenticated" ? (
        <Button onClick={() => void router.push("/")}>Sign In</Button>
      ) : null}
    </div>
  );
};
