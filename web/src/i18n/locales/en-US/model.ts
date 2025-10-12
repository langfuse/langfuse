const translation = {
  form: {
    createModelDefinition: "Create model definition",
    editModelDefinition: "Edit model definition",
    createModel: "Create Model",
    cloneModel: "Clone Model",
    editModel: "Edit Model",
    createNewModelDescription: "Create a new model configuration to track generation costs.",
    modelName: "Model Name",
    modelNameDescription: "Standardized model name. Generations are assigned to this model name if they match the `matchPattern` upon ingestion.",
    matchPattern: "Match pattern",
    matchPatternDescription:
      "Regular expression (Postgres syntax) to match ingested generations (model attribute) to this model definition. For an exact, case-insensitive match to a model name, use the expression: (?i)^(modelname)$",
    prices: "Prices",
    pricesDescription: "Set prices per usage type for this model. Usage types must exactly match the keys of the ingested usage details.",
    prefillUsageTypes: "Prefill usage types from template:",
    usageType: "Usage type",
    price: "Price",
    keyPlaceholder: "Key (e.g. input, output)",
    pricePlaceholder: "Price per unit",
    removePrice: "Remove price",
    addPrice: "Add Price",
    tokenizer: "Tokenizer",
    selectUnit: "Select a unit",
    tokenizerDescription:
      "Optionally, Langfuse can tokenize the input and output of a generation if no unit counts are ingested. This is useful for e.g. streamed OpenAI completions. For details on the supported tokenizers, see the",
    docs: "docs",
    tokenizerConfig: "Tokenizer Config",
    tokenizerConfigDescription: "The config for the tokenizer. Required for openai. See the",
    forDetails: "for details.",
  },
  success: {
    modelUpdated: "Model updated",
    modelCreated: "Model created",
    modelUpdatedDescription: "The model '{{modelName}}' has been successfully updated. New generations will use these model prices.",
    modelCreatedDescription: "The model '{{modelName}}' has been successfully created. New generations will use these model prices.",
  },
};

export default translation;
