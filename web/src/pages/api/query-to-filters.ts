import { type NextApiRequest, type NextApiResponse } from "next";
import { createTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { ChatMessageRole } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res
        .status(400)
        .json({ error: "Prompt parameter is required and must be a string" });
    }

    logger.info(`Processing natural language filter request: ${prompt}`);

    const ctx = await createTRPCContext({ req, res });
    const caller = appRouter.createCaller(ctx);

    // TODO: use prompt management
    const systemPrompt = `You are a helpful assistant that converts natural language queries into structured filters for a data analysis platform.

Given a user's natural language query, generate an array of filter objects that match the query intent.

FILTER TYPES AND STRUCTURE:
1. datetime: { type: "datetime", column: "string", operator: ">"|"<"|">="|"<=", value: "ISO_DATE_STRING" }
2. string: { type: "string", column: "string", operator: "="|"contains"|"does not contain"|"starts with"|"ends with", value: "string" }
3. number: { type: "number", column: "string", operator: "="|">"|"<"|">="|"<=", value: number }
4. stringOptions: { type: "stringOptions", column: "string", operator: "any of"|"none of", value: ["string1", "string2"] }
5. boolean: { type: "boolean", column: "string", operator: "="|"<>", value: true|false }
6. stringObject: { type: "stringObject", column: "string", key: "string", operator: "="|"contains"|"does not contain"|"starts with"|"ends with", value: "string" }
7. numberObject: { type: "numberObject", column: "string", key: "string", operator: "="|">"|"<"|">="|"<=", value: number }

COMMON COLUMNS:
- name, userId, version, tags, metadata, scores
- startTime, endTime, timestamp, createdAt
- model, input, output, usage, cost
- status, level, statusMessage

RESPONSE FORMAT:
Return ONLY a valid JSON array of filter objects. Do not include explanations or markdown formatting.

EXAMPLES:
Query: "Show traces from last week"
Response: [{"type": "datetime", "column": "timestamp", "operator": ">=", "value": "2024-01-15T00:00:00Z"}]

Query: "Find errors with high cost"
Response: [{"type": "string", "column": "level", "operator": "=", "value": "ERROR"}, {"type": "number", "column": "cost", "operator": ">", "value": 10}]

Query: "GPT-4 models in production environment"
Response: [{"type": "string", "column": "model", "operator": "contains", "value": "gpt-4"}, {"type": "stringObject", "column": "metadata", "key": "environment", "operator": "=", "value": "production"}]`;

    const messages = [
      {
        role: ChatMessageRole.System,
        content: systemPrompt,
      },
      {
        role: ChatMessageRole.User,
        content: prompt,
      },
    ];

    // Set appropriate model parameters for filter generation
    const modelParams = {
      model: "anthropic.claude-3-sonnet-20240229-v1:0", // Good balance of performance and cost
      temperature: 0.1, // Low temperature for consistent structured output
      maxTokens: 1000, // Enough for filter generation
      topP: 0.9,
    };

    // Call our tRPC router
    const completion = await caller.naturalLanguageFilters.createCompletion({
      messages,
      modelParams,
    });

    logger.info(
      `LLM completion received: ${JSON.stringify(completion, null, 2)}`,
    );

    try {
      const completionStr = completion as string;

      let jsonMatch = completionStr.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // If no array found, try to find just the JSON content
        jsonMatch = completionStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          // Wrap single object in array
          jsonMatch[0] = `[${jsonMatch[0]}]`;
        }
      }

      if (jsonMatch) {
        const parsedFilters = JSON.parse(jsonMatch[0]);

        if (Array.isArray(parsedFilters)) {
          logger.info(`Successfully parsed ${parsedFilters.length} filters`);

          return res.status(200).json({
            filters: parsedFilters,
          });
        }
      }

      // If parsing fails, try to parse the entire response as JSON
      const fallbackFilters = JSON.parse(completionStr);
      if (Array.isArray(fallbackFilters)) {
        return res.status(200).json({
          filters: fallbackFilters,
        });
      }

      throw new Error("Response is not a valid filter array");
    } catch (parseError) {
      logger.error("Failed to parse LLM response as filters:", parseError);
      logger.error("Raw LLM response:", completion);

      return res.status(500).json({
        error: "Failed to parse filters from LLM response",
        details:
          parseError instanceof Error ? parseError.message : "Parse error",
        rawResponse: completion, // Include raw response for debugging
      });
    }
  } catch (error) {
    logger.error("Error calling natural language filter service:", error);

    return res.status(500).json({
      error: "Failed to process query",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
