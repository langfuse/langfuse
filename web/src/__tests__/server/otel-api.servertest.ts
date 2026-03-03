import { makeAPICall } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
  getTraceById,
} from "@langfuse/shared/src/server";
import { randomBytes } from "crypto";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/otel/v1/traces API Endpoint", () => {
  it("should process a json payload correctly", async () => {
    const traceId = randomBytes(16);
    const spanId = randomBytes(8);

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "2.60.3",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "my-generation",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
    );

    expect(response.status).toBe(200);

    await waitForExpect(async () => {
      const trace = await getTraceById({
        projectId,
        traceId: traceId.toString("hex"),
      });
      expect(trace).toBeDefined();
      expect(trace!.id).toBe(traceId.toString("hex"));

      const observation = await getObservationById({
        projectId,
        id: spanId.toString("hex"),
      });
      expect(observation).toBeDefined();
      expect(observation!.id).toBe(spanId.toString("hex"));
      expect(observation!.name).toBe("my-generation");
    }, 25_000);
  }, 30_000);

  it("should process a json payload with usage details correctly", async () => {
    const traceId = randomBytes(16);
    const spanId = randomBytes(8);

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "2.60.3",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "my-generation",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.observation.input",
                      value: {
                        stringValue:
                          '[{"role": "system", "content": [{"type": "text", "text": "You are an expert assistant who can solve any task using code blobs. You will be given a task to solve as best you can.\nTo do so, you have been given access to a list of tools: these tools are basically Python functions which you can call with code.\nTo solve the task, you must plan forward to proceed in a series of steps, in a cycle of Thought, Code, and Observation sequences.\n\nAt each step, in the \'Thought:\' sequence, you should first explain your reasoning towards solving the task and the tools that you want to use.\nThen in the Code sequence you should write the code in simple Python. The code sequence must be opened with \'<code>\', and closed with \'</code>\'.\nDuring each intermediate step, you can use \'print()\' to save whatever important information you will then need.\nThese print outputs will then appear in the \'Observation:\' field, which will be available as input for the next step.\nIn the end you have to return a final answer using the `final_answer` tool.\n\nHere are a few examples using notional tools:\n---\nTask: \\"Generate an image of the oldest person in this document.\\"\n\nThought: I will proceed step by step and use the following tools: `document_qa` to find the oldest person in the document, then `image_generator` to generate an image according to the answer.\n<code>\nanswer = document_qa(document=document, question=\\"Who is the oldest person mentioned?\\")\nprint(answer)\n</code>\nObservation: \\"The oldest person in the document is John Doe, a 55 year old lumberjack living in Newfoundland.\\"\n\nThought: I will now generate an image showcasing the oldest person.\n<code>\nimage = image_generator(\\"A portrait of John Doe, a 55-year-old man living in Canada.\\")\nfinal_answer(image)\n</code>\n\n---\nTask: \\"What is the result of the following operation: 5 + 3 + 1294.678?\\"\n\nThought: I will use python code to compute the result of the operation and then return the final answer using the `final_answer` tool\n<code>\nresult = 5 + 3 + 1294.678\nfinal_answer(result)\n</code>\n\n---\nTask:\n\\"Answer the question in the variable `question` about the image stored in the variable `image`. The question is in French.\nYou have been provided with these additional arguments, that you can access using the keys as variables in your python code:\n{\'question\': \'Quel est l\'animal sur l\'image?\', \'image\': \'path/to/image.jpg\'}\\"\n\nThought: I will use the following tools: `translator` to translate the question into English and then `image_qa` to answer the question on the input image.\n<code>\ntranslated_question = translator(question=question, src_lang=\\"French\\", tgt_lang=\\"English\\")\nprint(f\\"The translated question is {translated_question}.\\")\nanswer = image_qa(image=image, question=translated_question)\nfinal_answer(f\\"The answer is {answer}\\")\n</code>\n\n---\nTask:\nIn a 1979 interview, Stanislaus Ulam discusses with Martin Sherwin about other great physicists of his time, including Oppenheimer.\nWhat does he say was the consequence of Einstein learning too much math on his creativity, in one word?\n\nThought: I need to find and read the 1979 interview of Stanislaus Ulam with Martin Sherwin.\n<code>\npages = web_search(query=\\"1979 interview Stanislaus Ulam Martin Sherwin physicists Einstein\\")\nprint(pages)\n</code>\nObservation:\nNo result found for query \\"1979 interview Stanislaus Ulam Martin Sherwin physicists Einstein\\".\n\nThought: The query was maybe too restrictive and did not find any results. Let\'s try again with a broader query.\n<code>\npages = web_search(query=\\"1979 interview Stanislaus Ulam\\")\nprint(pages)\n</code>\nObservation:\nFound 6 pages:\n[Stanislaus Ulam 1979 interview](https://ahf.nuclearmuseum.org/voices/oral-histories/stanislaus-ulams-interview-1979/)\n\n[Ulam discusses Manhattan Project](https://ahf.nuclearmuseum.org/manhattan-project/ulam-manhattan-project/)\n\n(truncated)\n\nThought: I will read the first 2 pages to know more.\n<code>\nfor url in [\\"https://ahf.nuclearmuseum.org/voices/oral-histories/stanislaus-ulams-interview-1979/\\", \\"https://ahf.nuclearmuseum.org/manhattan-project/ulam-manhattan-project/\\"]:\n    whole_page = visit_webpage(url)\n    print(whole_page)\n    print(\\"\\\n\\" + \\"=\\"*80 + \\"\\\n\\")  # Print separator between pages\n</code>\nObservation:\nManhattan Project Locations:\nLos Alamos, NM\nStanislaus Ulam was a Polish-American mathematician. He worked on the Manhattan Project at Los Alamos and later helped design the hydrogen bomb. In this interview, he discusses his work at\n(truncated)\n\nThought: I now have the final answer: from the webpages visited, Stanislaus Ulam says of Einstein: \\"He learned too much mathematics and sort of diminished, it seems to me personally, it seems to me his purely physics creativity.\\" Let\'s answer in one word.\n<code>\nfinal_answer(\\"diminished\\")\n</code>\n\n---\nTask: \\"Which city has the highest population: Guangzhou or Shanghai?\\"\n\nThought: I need to get the populations for both cities and compare them: I will use the tool `web_search` to get the population of both cities.\n<code>\nfor city in [\\"Guangzhou\\", \\"Shanghai\\"]:\n    print(f\\"Population {city}:\\", web_search(f\\"{city} population\\")\n</code>\nObservation:\nPopulation Guangzhou: [\'Guangzhou has a population of 15 million inhabitants as of 2021.\']\nPopulation Shanghai: \'26 million (2019)\'\n\nThought: Now I know that Shanghai has the highest population.\n<code>\nfinal_answer(\\"Shanghai\\")\n</code>\n\n---\nTask: \\"What is the current age of the pope, raised to the power 0.36?\\"\n\nThought: I will use the tool `wikipedia_search` to get the age of the pope, and confirm that with a web search.\n<code>\npope_age_wiki = wikipedia_search(query=\\"current pope age\\")\nprint(\\"Pope age as per wikipedia:\\", pope_age_wiki)\npope_age_search = web_search(query=\\"current pope age\\")\nprint(\\"Pope age as per google search:\\", pope_age_search)\n</code>\nObservation:\nPope age: \\"The pope Francis is currently 88 years old.\\"\n\nThought: I know that the pope is 88 years old. Let\'s compute the result using python code.\n<code>\npope_current_age = 88 ** 0.36\nfinal_answer(pope_current_age)\n</code>\n\nAbove example were using notional tools that might not exist for you. On top of performing computations in the Python code snippets that you create, you only have access to these tools, behaving like regular python functions:\n<code>\ndef web_search(query: string) -> string:\n    \\"\\"\\"Performs a duckduckgo web search based on your query (think a Google search) then returns the top search results.\n\n    Args:\n        query: The search query to perform.\n    \\"\\"\\"\n\ndef final_answer(answer: any) -> any:\n    \\"\\"\\"Provides a final answer to the given problem.\n\n    Args:\n        answer: The final answer to the problem\n    \\"\\"\\"\n\n</code>\n\nHere are the rules you should always follow to solve your task:\n1. Always provide a \'Thought:\' sequence, and a \'<code>\' sequence ending with \'</code>\', else you will fail.\n2. Use only variables that you have defined!\n3. Always use the right arguments for the tools. DO NOT pass the arguments as a dict as in \'answer = wikipedia_search({\'query\': \\"What is the place where James Bond lives?\\"})\', but use the arguments directly as in \'answer = wikipedia_search(query=\\"What is the place where James Bond lives?\\")\'.\n4. Take care to not chain too many sequential tool calls in the same code block, especially when the output format is unpredictable. For instance, a call to wikipedia_search has an unpredictable return format, so do not have another tool call that depends on its output in the same block: rather output results with print() to use them in the next block.\n5. Call a tool only when needed, and never re-do a tool call that you previously did with the exact same parameters.\n6. Don\'t name any new variable with the same name as a tool: for instance don\'t name a variable \'final_answer\'.\n7. Never create any notional variables in our code, as having these in your logs will derail you from the true variables.\n8. You can use imports in your code, but only from the following list of modules: [\'collections\', \'datetime\', \'itertools\', \'math\', \'queue\', \'random\', \'re\', \'stat\', \'statistics\', \'time\', \'unicodedata\']\n9. The state persists between code executions: so if in one step you\'ve created variables or imported modules, these will all persist.\n10. Don\'t give up! You\'re in charge of solving the task, not providing directions to solve it.\n\nNow Begin!"}]}, {"role": "user", "content": [{"type": "text", "text": "New task:\n\nWho won the chess world championship in 2024?\n"}]}]',
                      },
                    },
                    {
                      key: "langfuse.observation.model.parameters",
                      value: {
                        stringValue:
                          '{"temperature": 1, "max_tokens": "Infinity", "top_p": 1, "frequency_penalty": 0, "presence_penalty": 0}',
                      },
                    },
                    {
                      key: "langfuse.observation.type",
                      value: {
                        stringValue: "generation",
                      },
                    },
                    {
                      key: "langfuse.observation.output",
                      value: {
                        stringValue:
                          '{"role": "assistant", "content": "Thought: To find out who won the chess world championship in 2024, I will use the `wikipedia_search` tool to search for the information about the chess world championship in 2024. Once I have the relevant information, I will extract the name of the winner.\n\n<code>\ninformation = wikipedia_search(query=\\"Chess World Championship 2024\\")\nprint(information)\n"}',
                      },
                    },
                    {
                      key: "langfuse.observation.model.name",
                      value: {
                        stringValue: "gpt-3.5-turbo-0125",
                      },
                    },
                    {
                      key: "langfuse.observation.usage_details",
                      value: {
                        stringValue:
                          '{"completion_tokens": 80, "prompt_tokens": 1957, "total_tokens": 2037, "completion_tokens_details": {"accepted_prediction_tokens": 0, "audio_tokens": 0, "reasoning_tokens": 0, "rejected_prediction_tokens": 0}, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}}',
                      },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
    );

    expect(response.status).toBe(200);

    await waitForExpect(async () => {
      const trace = await getTraceById({
        projectId,
        traceId: traceId.toString("hex"),
      });
      expect(trace).toBeDefined();
      expect(trace!.id).toBe(traceId.toString("hex"));

      const observation = await getObservationById({
        projectId,
        id: spanId.toString("hex"),
        fetchWithInputOutput: true,
      });
      expect(observation).toBeDefined();
      expect(observation!.id).toBe(spanId.toString("hex"));
      expect(observation!.name).toBe("my-generation");
      expect(observation!.output).toContain("chess world championship");
      expect(observation!.totalCost).toBeCloseTo(0.0010985);
      expect(observation!.totalUsage).toBe(2037);
    }, 25_000);
  }, 30_000);

  it("should skip processing for empty resourceSpans", async () => {
    const payload = {
      // resourceSpans: []
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
    );

    expect(response.status).toBe(200);
  });

  // Skipping for now, as this requires direct writes into the events table without dual write.
  it.skip("should correctly convert string usage_details to numbers and compute total", async () => {
    // This test verifies that usage_details values sent as strings are correctly
    // converted to numbers, and the total is computed via numeric addition (not
    // string concatenation). This was a bug where "100" + "200" = "100200" instead of 300.
    const traceId = randomBytes(16);
    const spanId = randomBytes(8);

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: {
                name: "pydantic-ai",
                version: "v1.0.0",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "pydantic-ai-generation",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.environment",
                      value: { stringValue: "sdk-experiment" },
                    },
                    {
                      key: "langfuse.observation.type",
                      value: {
                        stringValue: "generation",
                      },
                    },
                    {
                      key: "langfuse.observation.model.name",
                      value: {
                        stringValue: "test-model",
                      },
                    },
                    // These are string values that should be converted to numbers
                    // The OTEL protocol can send these as stringValue
                    {
                      key: "gen_ai.usage.input_tokens",
                      value: { stringValue: "100" }, // String, should become number 100
                    },
                    {
                      key: "gen_ai.usage.output_tokens",
                      value: { stringValue: "200" }, // String, should become number 200
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
    );

    expect(response.status).toBe(200);

    await waitForExpect(async () => {
      const observation = await getObservationByIdFromEventsTable({
        projectId,
        id: spanId.toString("hex"),
      });

      expect(observation).toBeDefined();
      expect(observation!.id).toBe(spanId.toString("hex"));
      expect(observation!.name).toBe("pydantic-ai-generation");

      // Verify usage details are stored as numbers, not strings
      // The total should be 100 + 200 = 300 (numeric addition)
      // NOT "100" + "200" = "100200" (string concatenation)
      expect(observation!.totalUsage).toBe(300);

      // Also verify the individual values are numbers
      const usageDetails = observation!.usageDetails as Record<string, unknown>;
      expect(usageDetails).toBeDefined();
      expect(typeof usageDetails.input).toBe("number");
      expect(typeof usageDetails.output).toBe("number");
      expect(usageDetails.input).toBe(100);
      expect(usageDetails.output).toBe(200);
      expect(usageDetails.total).toBe(300);
    }, 25_000);
  }, 30_000);

  it("should accept sdk headers in underscore format", async () => {
    const traceId = randomBytes(16);
    const spanId = randomBytes(8);

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "4.0.0",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "underscore-header-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
      undefined,
      {
        x_langfuse_sdk_name: "python",
        x_langfuse_sdk_version: "4.0.0",
        x_langfuse_ingestion_version: "4",
      },
    );

    expect(response.status).toBe(200);

    await waitForExpect(async () => {
      const trace = await getTraceById({
        projectId,
        traceId: traceId.toString("hex"),
      });
      expect(trace).toBeDefined();

      const observation = await getObservationById({
        projectId,
        id: spanId.toString("hex"),
      });
      expect(observation).toBeDefined();
      expect(observation!.name).toBe("underscore-header-span");
    }, 25_000);
  }, 30_000);

  it("should transform deployment.environment to lowercase", async () => {
    const traceId = randomBytes(16);
    const spanId = randomBytes(8);

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "deployment.environment",
                value: { stringValue: "Production" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "2.60.3",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "test-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
    );

    expect(response.status).toBe(200);

    await waitForExpect(async () => {
      const trace = await getTraceById({
        projectId,
        traceId: traceId.toString("hex"),
      });
      expect(trace).toBeDefined();
      expect(trace!.id).toBe(traceId.toString("hex"));
      expect(trace!.environment).toBe("production");
    }, 25_000);
  }, 30_000);
});
