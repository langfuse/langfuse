import { type ChangeEvent, useState } from "react";
import { CircleCheck, CircleX } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import type { RouterOutputs } from "@/src/utils/api";

export type AddCustomModelDialogProps = {
  existingModels: string[];
  isAdding: boolean;
  isTesting: boolean;
  /** Resolves to whether the model was added; the dialog closes only then. */
  onAdd: (model: string) => Promise<boolean>;
  onAdded: () => void;
  onTest: (model: string) => Promise<CustomModelTestResult | undefined>;
};

export function AddCustomModelDialog({
  existingModels,
  isAdding,
  isTesting,
  onAdd,
  onAdded,
  onTest,
}: AddCustomModelDialogProps) {
  const [modelId, setModelId] = useState("");
  const [test, setTest] = useState<{
    model: string;
    result: CustomModelTestResult;
  }>();
  const model = modelId.trim();
  const isDuplicate = existingModels.includes(model);
  // A result only applies to the model ID it was sent for.
  const testResult = test?.model === model ? test.result : undefined;
  const addDisabledReason = getAddDisabledReason({
    model,
    isDuplicate,
    testSucceeded: testResult?.success === true,
  });

  async function handleAdd() {
    if (await onAdd(model)) onAdded();
  }

  function handleModelIdChange(event: ChangeEvent<HTMLInputElement>) {
    setModelId(event.target.value);
  }

  async function handleTest() {
    const result = await onTest(model);
    if (result) setTest({ model, result });
  }

  return (
    <Dialog
      title="Add custom model"
      size="md"
      actions={[
        {
          label: "Add model",
          onClick: handleAdd,
          loading: isAdding,
          disabled: addDisabledReason !== undefined,
          disabledReason: addDisabledReason,
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          Add a model the provider does not list, such as a fine-tuned model or
          an inference profile. Gateway keys can call it once it is enabled.
        </p>
        <FormField
          label="Model ID"
          description={
            isDuplicate ? "This model is already listed." : undefined
          }
        >
          {({ id, inputDescribedById }) => (
            <Input
              id={id}
              aria-describedby={inputDescribedById}
              value={modelId}
              placeholder="e.g. ft:gpt-4o-mini:my-org::abc123"
              autoFocus
              error={isDuplicate}
              onChange={handleModelIdChange}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <p
              className={
                testResult ? "text-foreground" : "text-muted-foreground"
              }
            >
              {testResult
                ? "Test this model with your current credential"
                : "This model hasn't been tested with your credential yet."}
            </p>
            <Button
              variant="outline"
              size="sm"
              text={testResult ? "Test again" : "Send test request"}
              loading={isTesting}
              disabled={model.length === 0}
              onClick={handleTest}
            />
          </div>
          {testResult ? <CustomModelTestOutcome result={testResult} /> : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

function getAddDisabledReason(params: {
  model: string;
  isDuplicate: boolean;
  testSucceeded: boolean;
}) {
  if (params.model.length === 0) return "Enter a model ID.";
  if (params.isDuplicate) return "This model is already listed.";
  if (!params.testSucceeded) return "Send a successful test request first.";
  return undefined;
}

function CustomModelTestOutcome({ result }: { result: CustomModelTestResult }) {
  if (result.success) {
    return (
      <div
        role="status"
        className="border-dark-green/20 bg-light-green flex gap-2 rounded-md border p-3"
      >
        <CircleCheck
          size="base"
          color="inherit"
          __rawClassName="text-dark-green mt-0.5"
          aria-hidden="true"
        />
        <div>
          <p className="text-dark-green font-bold">Request accepted</p>
          <p className="text-dark-green text-sm">
            The provider responded in {result.durationMs}ms. This model is ready
            to add.
          </p>
        </div>
      </div>
    );
  }
  const title = result.status
    ? `Request failed — ${result.status}`
    : "Request failed";
  return (
    <div
      role="alert"
      className="border-dark-red/20 bg-light-red flex gap-2 rounded-md border p-3"
    >
      <CircleX
        size="base"
        color="inherit"
        __rawClassName="text-dark-red mt-0.5"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-dark-red font-bold">{title}</p>
        <p className="ph-no-capture text-dark-red text-sm break-words">
          {result.error}
        </p>
      </div>
    </div>
  );
}

type CustomModelTestResult = RouterOutputs["aiGateway"]["testConnectionModel"];
