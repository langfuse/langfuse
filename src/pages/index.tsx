import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Link from "next/link";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";
import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import { useSession } from "next-auth/react";
import { Spinner } from "@/src/components/layouts/spinner";

export default function GetStartedPage() {
  const router = useRouter();
  const getStarted = router.query.getStarted === "1";

  const session = useSession();
  const projects = session.data?.user?.projects;
  const redirectProject = projects?.filter(
    (p) => p.id !== env.NEXT_PUBLIC_DEMO_PROJECT_ID,
  )[0];

  if (session.status === "authenticated" && redirectProject && !getStarted) {
    void router.push(`/project/${redirectProject.id}`);
    return <Spinner message="Redirecting" />;
  }

  if (session.status === "loading") {
    return <Spinner message="Loading" />;
  }

  const demoProject =
    env.NEXT_PUBLIC_DEMO_PROJECT_ID !== undefined
      ? projects?.find(
          (project) => project.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID,
        )
      : undefined;

  return (
    <div className="md:container">
      <Header
        title="Get started"
        actionButtons={
          <Button asChild>
            <Link href="https://docs.langfuse.com">Visit docs ↗</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle data-testid="create-new-project-title">
              Create new project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Get started by yourself. You can always reach out to us later or
              get help in the discord community.
            </p>
          </CardContent>
          <CardFooter>
            <NewProjectButton />
          </CardFooter>
        </Card>
        {demoProject ? (
          <Card className="flex-1">
            <CardHeader>
              <CardTitle>View demo project</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Checkout the {demoProject.name} project, it tracks the Q&A
                chatbot on the Langfuse documentation.
              </p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={"/project/" + demoProject.id}>
                  Go to demo project
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        <Card className={cn(demoProject && "col-span-full")}>
          <CardHeader>
            <CardTitle>Guided onboarding</CardTitle>
          </CardHeader>
          <CardContent>
            <p>If you prefer 1:1 support, we are happy to help.</p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="https://cal.com/marc-kl/langfuse-cloud">
                Schedule call with founder
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="https://discord.gg/7NXusRtqYU">Discord</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="mailto:onboarding@langfuse.com">Email</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
