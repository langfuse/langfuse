import {
  reportTrpcErrorWithoutToast,
  type RouterInputs,
  type RouterOutputs,
} from "@/src/utils/api";

type CreateItemsInput = RouterInputs["datasets"]["createManyDatasetItems"];
type CreateItemsResult = RouterOutputs["datasets"]["createManyDatasetItems"];

export async function submitDatasetItems({
  owner,
  input,
  submit,
  onPendingChange,
  onSuccess,
  onError,
}: {
  owner: { pending: boolean };
  input: CreateItemsInput;
  submit: (input: CreateItemsInput) => Promise<CreateItemsResult>;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  onError: (message: string | null) => void;
}) {
  if (owner.pending) return;
  owner.pending = true;
  onPendingChange(true);
  onError(null);
  let succeeded = false;
  try {
    const result = await submit(input);
    if (result.success) {
      succeeded = true;
    } else {
      onError(
        `Item does not match dataset schema. Errors: ${JSON.stringify(result.validationErrors, null, 2)}`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not add the dataset item. Please try again.";
    onError(
      message.includes("Body exc")
        ? "Data exceeds maximum size (4.5MB). Please attempt to create dataset item programmatically."
        : message,
    );
    reportTrpcErrorWithoutToast(error, "datasets");
  } finally {
    owner.pending = false;
    onPendingChange(false);
  }
  if (succeeded) onSuccess();
}
