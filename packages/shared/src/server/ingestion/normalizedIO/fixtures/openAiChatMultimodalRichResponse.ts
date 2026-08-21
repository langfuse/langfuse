import type { NormalizedIOFixture } from "./types";

/**
 * Synthetic OpenAI chat-completion case for the non-text surfaces: multimodal
 * content parts (image_url / input_audio / file in all three source shapes —
 * https URL, base64 data-URI, and Langfuse media reference token), refusal
 * parts, response-message url_citation annotations, and audio output.
 *
 * Media handling contract exercised here:
 * - `@@@langfuseMedia:type=X|id=Y|source=Z@@@` tokens (the dominant shape in
 *   stored production IO) become `file` parts with `kind: "reference"`,
 *   mediaType from the token, and the token's `source` in providerMetadata.
 * - Unknown media subtypes fall back to modality wildcards (`image/*`,
 *   `audio/*`) when the part kind reveals the modality, and omit mediaType
 *   entirely when it does not (opaque file ids).
 * - Refusals stay findable: they normalize to text parts flagged with
 *   `refusal: true` (typed field) so evals can filter refusal observations.
 */
export const openAiChatMultimodalRichResponseFixture = {
  name: "normalizes OpenAI chat-completion multimodal content and rich response fields",
  spanIO: {
    input: {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
          role: "user",
          content: [
            { type: "text", text: "What is in these files?" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/cat.png", detail: "low" },
            },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,aGVsbG8=" },
            },
            {
              type: "image_url",
              image_url: {
                url: "@@@langfuseMedia:type=image/jpeg|id=media-ref-image-1|source=base64@@@",
              },
            },
            {
              type: "input_audio",
              input_audio: { data: "UklGRg==", format: "wav" },
            },
            {
              type: "input_audio",
              input_audio: {
                data: "@@@langfuseMedia:type=audio/mpeg|id=media-ref-audio-1|source=base64@@@",
              },
            },
            {
              type: "file",
              file: { file_data: "JVBERi0=", filename: "report.pdf" },
            },
            { type: "file", file: { file_id: "file-abc123" } },
            "@@@langfuseMedia:type=application/pdf|id=media-ref-file-1|source=bytes@@@",
            // Text with several embedded media tokens splits into
            // interleaved text and file parts.
            {
              type: "text",
              text: "Compare @@@langfuseMedia:type=image/png|id=media-ref-inline-1|source=base64@@@ with @@@langfuseMedia:type=image/png|id=media-ref-inline-2|source=base64@@@ please.",
            },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "refusal", refusal: "I cannot describe this image." },
          ],
        },
      ],
    },
    output: {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "The Eiffel Tower is 330 meters tall.",
            refusal: null,
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/eiffel",
                  title: "Eiffel Tower",
                  start_index: 0,
                  end_index: 37,
                },
              },
            ],
            audio: {
              id: "audio_001",
              data: "@@@langfuseMedia:type=audio/mpeg|id=media-ref-audio-2|source=base64@@@",
              transcript: "The Eiffel Tower is 330 meters tall.",
              expires_at: 1755672000,
            },
          },
          finish_reason: "stop",
        },
      ],
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "You are a helpful assistant." }],
        source: "input",
      },
      {
        role: "user",
        parts: [
          { type: "text", text: "What is in these files?" },
          {
            type: "file",
            mediaType: "image/*",
            content: { kind: "url", url: "https://example.com/cat.png" },
            providerMetadata: { detail: "low" },
          },
          {
            type: "file",
            // Data-URIs stay urls (they render as urls; decoding is the media
            // pipeline's job), but the prefix still declares the exact type.
            mediaType: "image/png",
            content: { kind: "url", url: "data:image/png;base64,aGVsbG8=" },
          },
          {
            type: "file",
            mediaType: "image/jpeg",
            content: { kind: "reference", id: "media-ref-image-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            mediaType: "audio/wav",
            content: { kind: "base64", data: "UklGRg==" },
          },
          {
            type: "file",
            mediaType: "audio/mpeg",
            content: { kind: "reference", id: "media-ref-audio-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            filename: "report.pdf",
            content: { kind: "base64", data: "JVBERi0=" },
          },
          {
            type: "file",
            content: { kind: "reference", id: "file-abc123" },
          },
          {
            type: "file",
            mediaType: "application/pdf",
            content: { kind: "reference", id: "media-ref-file-1" },
            providerMetadata: { source: "bytes" },
          },
          { type: "text", text: "Compare " },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "media-ref-inline-1" },
            providerMetadata: { source: "base64" },
          },
          { type: "text", text: " with " },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "media-ref-inline-2" },
            providerMetadata: { source: "base64" },
          },
          { type: "text", text: " please." },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            refusal: true,
            text: "I cannot describe this image.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "The Eiffel Tower is 330 meters tall.",
            providerMetadata: {
              citations: [
                {
                  type: "url_citation",
                  url_citation: {
                    url: "https://example.com/eiffel",
                    title: "Eiffel Tower",
                    start_index: 0,
                    end_index: 37,
                  },
                },
              ],
            },
          },
          {
            type: "file",
            mediaType: "audio/mpeg",
            content: { kind: "reference", id: "media-ref-audio-2" },
            providerMetadata: {
              source: "base64",
              id: "audio_001",
              transcript: "The Eiffel Tower is 330 meters tall.",
              expires_at: 1755672000,
            },
          },
        ],
        // The finish reason lives on the choice, not the message.
        finishReason: { type: "stop", raw: "stop" },
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
