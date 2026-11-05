import { useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";

export type CustomModelTestResult =
  | { success: true }
  | { success: false; error: string };

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
  const [testResult, setTestResult] = useState<CustomModelTestResult>();
  const model = modelId.trim();
  const isDuplicate = existingModels.includes(model);

  async function handleAdd() {
    if (await onAdd(model)) onAdded();
  }

  async function handleTest() {
    setTestResult(await onTest(model));
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
          disabled: model.length === 0 || isDuplicate,
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
              onChange={(event) => {
                setModelId(event.target.value);
                setTestResult(undefined);
              }}
            />
          )}
        </FormField>
        <div>
          <Button
            variant="outline"
            text="Send test request"
            loading={isTesting}
            disabled={model.length === 0}
            onClick={handleTest}
          />
        </div>
        {testResult ? <CustomModelTestAlert result={testResult} /> : null}
      </Dialog.Body>
    </Dialog>
  );
}

function CustomModelTestAlert({ result }: { result: CustomModelTestResult }) {
  if (result.success) {
    return (
      <Alert variant="info">
        <Alert.Title>The provider accepted the request</Alert.Title>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <Alert.Title>The test request failed</Alert.Title>
      <Alert.Description>{result.error}</Alert.Description>
    </Alert>
  );
}
