import z from "zod";

export const langfuseObjects = [
  "trace",
  "span",
  "generation",
  "event",
] as const;

export const variableMapping = z
  .object({
    templateVariable: z.string(),
    objectName: z.string().nullish(), // can be null as this is only required for langfuseObjects other than trace
    langfuseObject: z.enum(langfuseObjects),
    selectedColumnId: z.string(),
  })
  .refine(
    (value) => value.langfuseObject === "trace" || value.objectName !== null,
    {
      message: "objectName is required for langfuseObjects other than trace",
    }
  );

export const variableMappingList = z.array(variableMapping);

export const wipVariableMapping = z.object({
  templateVariable: z.string(),
  objectName: z.string().nullish(),
  langfuseObject: z.enum(langfuseObjects),
  selectedColumnId: z.string().nullish(),
});
