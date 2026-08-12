// CIP fork feature (see FORK.md): Elicitations — participatory sessions that
// source evaluation criteria and rubric weights from human participants.
// v1 is the landing page only; session design/creation flows come later.
import Page from "@/src/components/layouts/page";
import { SplashScreen } from "@/src/components/ui/splash-screen";

export default function Elicitations() {
  return (
    <Page
      headerProps={{
        title: "Elicitations",
        help: {
          description:
            "Elicitations are structured sessions that gather judgments, criteria, and reflections from human participants. They are used to source evaluation criteria and rubric weights directly from affected communities before they're encoded into blueprints.",
        },
      }}
      scrollable
    >
      <SplashScreen
        title="Get started with Elicitations"
        description="Design elicitation sessions to gather structured judgments from participants. Turn community input into evaluation criteria and export them directly into Weval blueprints."
        primaryAction={{
          label: "New elicitation",
        }}
        secondaryAction={{
          label: "Learn More",
        }}
      />
    </Page>
  );
}
