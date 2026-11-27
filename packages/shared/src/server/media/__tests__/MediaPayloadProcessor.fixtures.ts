// Payload examples shared by the TypeScript golden tests and the direct native
// comparison. Raw duplicate-key cases live in the native suite because building
// those through JavaScript objects would erase the input that needs testing.
export const MEDIA_ID = "test-media-id";

export const PNG_BYTES = Buffer.from("test-image");
export const PNG_BASE64 = PNG_BYTES.toString("base64");
export const DATA_URI = `data:image/png;base64,${PNG_BASE64}`;

export const TEXT_BASE64 = Buffer.from("hello").toString("base64");
export const TEXT_DATA_URI = `data:text/plain;charset=utf-8;base64,${TEXT_BASE64}`;

export const DATA_URI_PUNCTUATIONS = [".", ";", "?", "!"] as const;
export const REPEATED_DATA_PREFIX = "data:".repeat(256_000);
export const REPEATED_DATA_URI_VALUE = `${REPEATED_DATA_PREFIX}${DATA_URI}`;

export const providerMediaCases = [
  {
    name: "anthropic",
    value: { type: "base64", media_type: "image/png", data: PNG_BASE64 },
    referencePath: "data",
  },
  {
    name: "vertex",
    value: { type: "media", mime_type: "image/png", data: PNG_BASE64 },
    referencePath: "data",
  },
  {
    name: "gemini",
    value: { inline_data: { mime_type: "image/png", data: PNG_BASE64 } },
    referencePath: "inline_data.data",
  },
  {
    name: "ai_sdk_v6",
    value: { type: "file", mediaType: "image/png", data: PNG_BASE64 },
    referencePath: "data",
  },
  {
    name: "ai_sdk_v7",
    value: { type: "blob", mime_type: "image/png", content: PNG_BASE64 },
    referencePath: "content",
  },
] as const;

export const MIXED_STRINGIFIED_VALUE = JSON.stringify({
  image: DATA_URI,
  document: providerMediaCases[0].value,
});

export const PYTHON_BYTES = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  ...Buffer.from("test\nquote'slash\\"),
  0x00,
]);
const PYTHON_BYTES_LITERAL =
  "b'\\xff\\xd8\\xff\\xe0test\\nquote\\'slash\\\\\\x00'";
export const PYTHON_STRINGIFIED_VALUE = JSON.stringify({
  inline_data: {
    mime_type: "image/jpeg",
    data: PYTHON_BYTES_LITERAL,
  },
});
export const MALFORMED_PYTHON_VALUE = {
  inline_data: {
    mime_type: "image/jpeg",
    data: "b'\\xff\\x0g'",
  },
};

function asJsonCase(name: string, value: unknown) {
  return { name, json: JSON.stringify(value) };
}

export const mediaPayloadCases: { name: string; json: string }[] = [
  asJsonCase("data_uri", DATA_URI),
  ...DATA_URI_PUNCTUATIONS.map((punctuation) =>
    asJsonCase(
      `embedded_data_uri_${punctuation}`,
      `media: ${DATA_URI}${punctuation}`,
    ),
  ),
  asJsonCase("data_uri_with_parameters", TEXT_DATA_URI),
  asJsonCase("repeated_data_prefix", REPEATED_DATA_URI_VALUE),
  asJsonCase("repeated_prefix_without_media", "data: ".repeat(256_000)),
  ...providerMediaCases.map(({ name, value }) =>
    asJsonCase(`provider_${name}`, value),
  ),
  asJsonCase("mixed_stringified_json", MIXED_STRINGIFIED_VALUE),
  asJsonCase("python_bytes", PYTHON_STRINGIFIED_VALUE),
  asJsonCase("malformed_python_bytes", MALFORMED_PYTHON_VALUE),
];
