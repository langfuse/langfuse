import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Header from "@/src/components/layouts/header";
import { OrganizationProjectOverview } from "@/src/features/organizations/components/ProjectOverview";

export default function GetStartedPage() {
  return (
    <div className="md:container">
      <Header title="Home" />
      <OrganizationProjectOverview />
    </div>
  );
}

const Onboarding = () => {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle data-testid="create-new-project-title">
            Create new project
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            Get started by yourself. You can always reach out to us later or get
            help in the discord community.
          </p>
        </CardContent>
        <CardFooter>{/* <NewProjectButton /> */}</CardFooter>
      </Card>
      {/* {demoProject ? (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>View demo project</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Checkout the {demoProject.name} project, it tracks the Q&A chatbot
              on the Langfuse documentation.
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
      </Card> */}
    </div>
  );
};
