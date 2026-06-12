/** @jest-environment node */

import { parsePromptFromResponse } from "@/src/features/meta-prompt/utils/parsePromptFromResponse";

describe("parsePromptFromResponse", () => {
  it("should parse a complete response with all sections", () => {
    const response = `## Clarifying Questions
None needed.

## Assumptions
1. The user wants a REST API.
2. The output should be in JSON.

## Improved Prompt
### Task
Build a REST API endpoint.
### Objective
Create a reliable endpoint.

## User Fill-in Checklist
- [ ] Replace {domain} with your specific domain
- [ ] Set the API version`;

    const result = parsePromptFromResponse(response);

    expect(result.clarifyingQuestions).toBe("None needed.");
    expect(result.assumptions).toBe(
      "1. The user wants a REST API.\n2. The output should be in JSON.",
    );
    expect(result.improvedPrompt).toContain("### Task");
    expect(result.improvedPrompt).toContain("Build a REST API endpoint.");
    expect(result.improvedPrompt).toContain("### Objective");
    expect(result.fillInChecklist).toContain(
      "Replace {domain} with your specific domain",
    );
  });

  it("should parse a response with only Improved Prompt", () => {
    const response = `## Improved Prompt
### Task
Summarize the document.
### Output Format
A bullet-point list.`;

    const result = parsePromptFromResponse(response);

    expect(result.improvedPrompt).toContain("Summarize the document.");
    expect(result.improvedPrompt).toContain("### Output Format");
    expect(result.clarifyingQuestions).toBeNull();
    expect(result.assumptions).toBeNull();
    expect(result.fillInChecklist).toBeNull();
  });

  it("should parse a response with only Clarifying Questions", () => {
    const response = `## Clarifying Questions
1. What is the target audience?
2. What format should the output be in?
3. Is there a word limit?`;

    const result = parsePromptFromResponse(response);

    expect(result.clarifyingQuestions).toContain(
      "What is the target audience?",
    );
    expect(result.clarifyingQuestions).toContain(
      "What format should the output be in?",
    );
    expect(result.improvedPrompt).toBeNull();
    expect(result.assumptions).toBeNull();
    expect(result.fillInChecklist).toBeNull();
  });

  it("should return all nulls for an empty response", () => {
    const result = parsePromptFromResponse("");

    expect(result.improvedPrompt).toBeNull();
    expect(result.clarifyingQuestions).toBeNull();
    expect(result.assumptions).toBeNull();
    expect(result.fillInChecklist).toBeNull();
  });

  it("should return all nulls for plain text without section headers", () => {
    const response =
      "This is just some plain text without any section markers.";

    const result = parsePromptFromResponse(response);

    expect(result.improvedPrompt).toBeNull();
    expect(result.clarifyingQuestions).toBeNull();
    expect(result.assumptions).toBeNull();
    expect(result.fillInChecklist).toBeNull();
  });

  it("should handle sections with empty content", () => {
    const response = `## Clarifying Questions

## Assumptions

## Improved Prompt
Some prompt content here.

## User Fill-in Checklist
`;

    const result = parsePromptFromResponse(response);

    expect(result.clarifyingQuestions).toBe("");
    expect(result.assumptions).toBe("");
    expect(result.improvedPrompt).toBe("Some prompt content here.");
    expect(result.fillInChecklist).toBe("");
  });

  it("should handle headers with trailing annotations like (0-5)", () => {
    const response = `## Clarifying Questions (0-5)
What is the target?

## Assumptions (0-3)
None.

## Improved Prompt
The prompt.`;

    const result = parsePromptFromResponse(response);

    // extractSection finds "## Clarifying Questions" then includes " (0-5)" as part of content
    expect(result.clarifyingQuestions).toContain("What is the target?");
    expect(result.assumptions).toContain("None.");
    expect(result.improvedPrompt).toBe("The prompt.");
  });

  it("should correctly separate content between adjacent sections", () => {
    const response = `## Clarifying Questions
Question 1?
Question 2?

## Assumptions
Assumption A.

## Improved Prompt
The prompt text.`;

    const result = parsePromptFromResponse(response);

    expect(result.clarifyingQuestions).toBe("Question 1?\nQuestion 2?");
    expect(result.assumptions).toBe("Assumption A.");
    expect(result.improvedPrompt).toBe("The prompt text.");
  });
});
