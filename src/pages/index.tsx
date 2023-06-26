import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Link from "next/link";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";
import Header from "@/src/components/layouts/header";

export default function GetStartedPage() {
  return (
    <div className="md:container">
      <Header title="Get started" />
      <div className="flex flex-col gap-5 md:flex-row">
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
        <Card className="flex-1">
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
