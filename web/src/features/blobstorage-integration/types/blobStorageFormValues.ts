import { type Control } from "react-hook-form";
import { type z } from "zod";
import type {
  blobStorageIntegrationFormSchema,
  BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";

// Pre-parse (input) shape of the form; zod defaults make some fields optional.
export type BlobStorageFormValues = z.input<
  typeof blobStorageIntegrationFormSchema
>;

// Control handle shared by the form's field-group components.
export type BlobStorageFormControl = Control<
  BlobStorageFormValues,
  unknown,
  BlobStorageIntegrationFormSchema
>;
