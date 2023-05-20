import { useRouter } from "next/router";
import Header from "~/components/layouts/header";

import { api } from "~/utils/api";

export default function LlmCallPage() {
  const router = useRouter();
  const { llmCallId } = router.query;

  const llmCall = api.llmCalls.byId.useQuery(llmCallId as string, {
    enabled: llmCallId !== undefined,
  });

  return (
    <>
      <Header
        title="LLM Call"
        breadcrumb={[
          { name: "LLM Calls", href: "/llm-calls" },
          { name: llmCallId as string },
        ]}
      />
      {llmCall.isSuccess ? (
        <>
          <div className="flex w-full space-x-3">
            <div className="flex-1 border-2 border-gray-300 p-2">
              <div className="font-semibold">Prompt</div>
              {llmCall.data.attributes.prompt ?? ""}
            </div>
            <div className="flex-1 border-2 border-gray-300 p-2">
              <div className="font-semibold">Completion</div>
              {llmCall.data.attributes.completion ?? ""}
            </div>
          </div>
          <div className="mt-2">
            Tokens: {llmCall.data.attributes.tokens.prompt} prompt tokens,{" "}
            {llmCall.data.attributes.tokens.completion} completion tokens
          </div>
        </>
      ) : null}

      <pre>{JSON.stringify(llmCall.data, null, 2)}</pre>
    </>
  );
}
