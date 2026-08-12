// CIP fork feature (see FORK.md): the public respondent page — no app chrome,
// no login. One page per screen with progress; answers submit at the end via
// the public procedure; a thank-you screen closes the loop.
import { api } from "@/src/utils/api";
import Head from "next/head";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { type Answer } from "../lib/contract";
import { ElicitationRenderer } from "../components/renderer/ElicitationRenderer";

function CenteredMessage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export default function PublicForm() {
  const router = useRouter();
  const formId = router.query.formId as string;

  // Captured once on load so time-to-complete is measurable server-side.
  const startedAt = useMemo(() => new Date().toISOString(), []);

  const form = api.elicitations.publicForm.useQuery(
    { formId },
    { enabled: !!formId, retry: false, refetchOnWindowFocus: false },
  );

  const submit = api.elicitations.publicSubmit.useMutation();
  const followUp = api.elicitations.publicInterviewFollowUp.useMutation();

  const onSubmit = async (answers: Answer[]) => {
    await submit.mutateAsync({ formId, answers, startedAt });
  };

  if (form.isLoading) {
    return <CenteredMessage title="Loading…" />;
  }
  if (form.isError || !form.data) {
    return (
      <CenteredMessage
        title="Form not found"
        description="This form doesn't exist or hasn't been published."
      />
    );
  }
  if (form.data.status === "closed") {
    return (
      <CenteredMessage
        title={form.data.settings.closed_title ?? "This form is closed"}
        description={
          form.data.settings.closed_description ??
          "It is no longer accepting responses. Thank you for your interest."
        }
      />
    );
  }

  return (
    <>
      <Head>
        <title>{form.data.name}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen flex-col">
        <ElicitationRenderer
          fields={form.data.fields}
          settings={form.data.settings}
          onSubmit={onSubmit}
          onInterviewFollowUp={async ({ field, initial, exchanges }) => {
            const result = await followUp.mutateAsync({
              formId,
              fieldId: field.id,
              initial,
              exchanges,
            });
            return result.question;
          }}
          className="flex-1"
        />
      </div>
    </>
  );
}
