import {
  coachAgentThinking,
  nutritionAgentThinking,
  visionAgentThinking,
} from "./spielwiesePlaygroundThinkingData";

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
            'You are a food identification expert. Identify every food item in the image.\nWrite the structured result to {{detected_foods}} and any plating notes to {{plating_notes}}.\nReturn ONLY JSON:\n[{"item":"grilled salmon","estimated_weight_g":180}, ...]',
        },
      ],
      notes: [
        { id: "tools", value: "No tools." },
        { id: "mode", value: "Pure vision." },
      ],
      playgroundThinking: visionAgentThinking,
      playgroundPreview: {
        format: "json",
        label: "Answer",
        toneSectionId: "system",
        value: `[
  {
    "item": "grilled salmon",
    "estimated_weight_g": 186
  },
  {
    "item": "asparagus",
    "estimated_weight_g": 64
  },
  {
    "item": "lemon wedge",
    "estimated_weight_g": 12
  }
]`,
      },
    },
    {
      id: "nutrition-agent",
      stepLabel: "Step 2",
      title: "Nutrition Agent",
      description: "calculates everything",
      kind: "Calculator",
      settings: [
        { id: "model", label: "Model", value: "GPT-4.1" },
        { id: "temperature", label: "Temperature", value: "0.2" },
        { id: "top-p", label: "Top P", value: "0.9" },
        { id: "response-format", label: "Response format", value: "json" },
        { id: "stop-sequence", label: "Stop sequence", value: "none" },
        { id: "reasoning", label: "Reasoning", value: "on / 512 tok" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[JSON from {{detected_foods}}]" },
        {
          id: "system",
          label: "Instructions",
          value:
            'You are a clinical nutritionist.\nUse USDA FoodData Central values.\nWrite totals to {{macro_estimates}} and micronutrient notes to {{micronutrient_notes}}.\nReturn ONLY JSON:\n{"items":[...],"totals":{...}}',
        },
      ],
      notes: [{ id: "source", value: "USDA FoodData Central" }],
      playgroundThinking: nutritionAgentThinking,
      playgroundPreview: {
        format: "json",
        label: "Answer",
        toneSectionId: "system",
        value: `{
  "items": [
    {
      "item": "grilled salmon",
      "weight_g": 186,
      "kcal": 366,
      "protein_g": 40.5,
      "carbs_g": 0,
      "fat_g": 22.1,
      "fiber_g": 0
    },
    {
      "item": "asparagus",
      "weight_g": 64,
      "kcal": 13,
      "protein_g": 1.4,
      "carbs_g": 2.5,
      "fat_g": 0.1,
      "fiber_g": 1.3
    }
  ],
  "totals": {
    "kcal": 379,
    "protein_g": 41.9,
    "carbs_g": 2.5,
    "fat_g": 22.2,
    "fiber_g": 1.3
  }
}`,
      },
    },
    {
      id: "coach-agent",
      stepLabel: "Step 3",
      title: "Coach Agent",
      description: "turns data into guidance",
      kind: "Responder",
      settings: [
        { id: "model", label: "Model", value: "GPT-4o mini" },
        { id: "temperature", label: "Temperature", value: "0.4" },
        { id: "top-p", label: "Top P", value: "0.85" },
        { id: "response-format", label: "Response format", value: "text" },
        { id: "stop-sequence", label: "Stop sequence", value: "none" },
        { id: "reasoning", label: "Reasoning", value: "off / 0 tok" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[JSON from {{macro_estimates}}]" },
        {
          id: "system",
          label: "Instructions",
          value: "You are a nutrition coach.\nReturn natural language only.",
        },
      ],
      notes: [{ id: "tools", value: "No tools." }],
      playgroundThinking: coachAgentThinking,
      playgroundPreview: {
        format: "text",
        label: "Answer",
        toneSectionId: "system",
        value:
          "Estimated meal: 379 kcal with strong protein and very low carbs. The salmon drives most of the calories and protein, while the asparagus adds a light fiber boost.",
      },
    },
  ],
};
