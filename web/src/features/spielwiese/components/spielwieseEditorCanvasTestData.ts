export const spielwieseEditorCanvasTestCanvas = {
  title: "Assistant",
  helper: "Start from a blank page and shape the structure from the rail.",
  stats: [
    {
      id: "blocks",
      label: "Blocks",
      value: "01",
    },
  ],
  agentNodes: [
    {
      id: "vision-agent",
      stepLabel: "Step 1",
      title: "Vision Agent",
      description: "identifies + estimates",
      kind: "Classifier",
      settings: [
        { id: "model", label: "Model", value: "GPT-4.1 mini" },
        { id: "temperature", label: "Temperature", value: "0.1" },
        { id: "top-p", label: "Top P", value: "1.0" },
        { id: "response-format", label: "Response format", value: "json" },
        { id: "stop-sequence", label: "Stop sequence", value: "none" },
        { id: "reasoning", label: "Reasoning", value: "off / 0 tok" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[image]" },
        {
          id: "system",
          label: "Instructions",
          value:
            'You are a food identification expert. Identify every food item in the image.\nReturn ONLY JSON:\n[{"item":"grilled salmon","estimated_weight_g":180}, ...]',
        },
        {
          id: "assistant",
          label: "How the assistant should reply",
          value: "[JSON]",
        },
      ],
      notes: [
        { id: "tools", value: "No tools." },
        { id: "mode", value: "Pure vision." },
      ],
    },
    {
      id: "nutrition-agent",
      stepLabel: "Step 2",
      title: "Nutrition Agent",
      description: "calculates everything",
      kind: "Calculator",
      settings: [
        { id: "model", label: "Model", value: "GPT-4.1" },
        { id: "output", label: "Output", value: "macro_estimates" },
        { id: "temperature", label: "Temperature", value: "0.2" },
        { id: "top-p", label: "Top P", value: "0.9" },
        { id: "response-format", label: "Response format", value: "json" },
        { id: "stop-sequence", label: "Stop sequence", value: "none" },
        { id: "reasoning", label: "Reasoning", value: "on / 512 tok" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[JSON from Step 1]" },
        {
          id: "system",
          label: "Instructions",
          value:
            'You are a clinical nutritionist.\nUse USDA FoodData Central values.\nReturn ONLY JSON:\n{"items":[...],"totals":{...}}',
        },
        {
          id: "assistant",
          label: "How the assistant should reply",
          value: "[JSON]",
        },
      ],
      notes: [{ id: "source", value: "USDA FoodData Central" }],
    },
    {
      id: "coach-agent",
      stepLabel: "Step 3",
      title: "Coach Agent",
      description: "turns data into guidance",
      kind: "Responder",
      settings: [
        { id: "model", label: "Model", value: "GPT-4o mini" },
        { id: "input", label: "Input", value: "macro_estimates" },
        { id: "output", label: "Output", value: "coach_summary" },
        { id: "temperature", label: "Temperature", value: "0.4" },
        { id: "top-p", label: "Top P", value: "0.85" },
        { id: "response-format", label: "Response format", value: "text" },
        { id: "stop-sequence", label: "Stop sequence", value: "none" },
        { id: "reasoning", label: "Reasoning", value: "off / 0 tok" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[JSON from Step 2]" },
        {
          id: "system",
          label: "Instructions",
          value: "You are a nutrition coach.\nReturn natural language only.",
        },
        {
          id: "assistant",
          label: "How the assistant should reply",
          value: "[final summary]",
        },
      ],
      notes: [{ id: "tools", value: "No tools." }],
    },
  ],
};
