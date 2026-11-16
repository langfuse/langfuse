import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/** DemoOrganizationTile links to the public demo project */
export const DemoOrganizationTile = () => {
  const capture = usePostHogClientCapture();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try Langfuse Demo</CardTitle>
      </CardHeader>
      <CardContent>
        We have built a Q&A chatbot that answers questions based on the Langfuse
        Docs. Interact with it to see traces in Langfuse.
      </CardContent>
      <CardFooter>
        <Button asChild variant="secondary">
          <Link
            href={`/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}/traces`}
            onClick={() =>
              capture("organizations:demo_project_button_click", {
                location: "project_overview_demo_tile",
              })
            }
          >
            View Demo Project
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
