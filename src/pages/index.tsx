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
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { env } from "@/src/env.mjs";

export default function GetStartedPage() {
  const projects = api.projects.all.useQuery();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // check url query for welcome = 1
  const getStarted = router.query.getStarted === "1";

  useEffect(() => {
    if (projects.data) {
      if (
        projects.data.filter((p) => p.id !== env.NEXT_PUBLIC_DEMO_PROJECT_ID)
          .length > 0 &&
        loading === true &&
        !getStarted
      )
        void router.push(
          `/project/${
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            projects.data.filter(
              (p) => p.id !== env.NEXT_PUBLIC_DEMO_PROJECT_ID
            )[0]!.id
          }`
        );
      else setLoading(false);
    }
  }, [projects.data, router, loading, getStarted]);

  if (loading || projects.status === "loading") {
    return <div>Loading...</div>;
  }

  const demoProject =
    env.NEXT_PUBLIC_DEMO_PROJECT_ID !== undefined && projects.data?.length
      ? projects.data.find(
          (project) => project.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID
        )
      : undefined;

  return (
    <div className="md:container">
      <Header title="Get started" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Create new project</CardTitle>
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
                <Link href={"/project/" + demoProject.id}>Go to project</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link
                  href="https://langfuse.com/docs/qa-chatbot"
                  target="_blank"
                >
                  Chatbot
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        <Card className="col-span-full">
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
