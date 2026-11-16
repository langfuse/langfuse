import { BookOpen, MessageSquareText, PlusIcon } from "@langfuse/icons";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { createOrganizationRoute } from "@/src/features/setup/setupRoutes";

/** GetStartedCard points users without an organization to creating one or to the docs */
export const GetStartedCard = ({
  canCreateOrganizations,
}: {
  canCreateOrganizations: boolean;
}) => (
  <Card>
    <CardHeader>
      <CardTitle data-testid="create-new-project-title">Get Started</CardTitle>
    </CardHeader>
    <CardContent>
      <CardDescription>
        {canCreateOrganizations
          ? "Create an organization to get started. Alternatively, ask your organization admin to invite you."
          : "You need to get invited to an organization to get started with Langfuse."}
      </CardDescription>
    </CardContent>
    <CardFooter className="flex gap-4">
      {canCreateOrganizations && (
        <Button data-testid="create-project-btn" asChild>
          <Link href={createOrganizationRoute}>
            <PlusIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
            New Organization
          </Link>
        </Button>
      )}
      <Button variant="secondary" asChild>
        <Link href="https://langfuse.com/docs" target="_blank">
          <BookOpen size="base" __rawClassName="mr-2" aria-hidden="true" />
          Docs
        </Link>
      </Button>
      <Button variant="secondary" asChild>
        <Link href="https://langfuse.com/docs/ask-ai" target="_blank">
          <MessageSquareText
            size="base"
            __rawClassName="mr-2"
            aria-hidden="true"
          />
          Ask AI
        </Link>
      </Button>
    </CardFooter>
  </Card>
);
