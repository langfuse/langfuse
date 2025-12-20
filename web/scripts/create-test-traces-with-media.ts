/**
 * Script to create test traces with different media attachment permutations
 *
 * Usage: npx tsx scripts/create-test-traces-with-media.ts
 *
 * This creates several test traces with different combinations of media:
 * - Image only (input)
 * - PDF only (output)
 * - Audio only (metadata)
 * - Image + PDF (input + output)
 * - All three types (input + output + metadata)
 * - Multiple files of same type
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const API_BASE = "http://localhost:3100";
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const AUTH_HEADER =
  "Basic " +
  Buffer.from("pk-lf-1234567890:sk-lf-1234567890").toString("base64");

// Read test files
const imagePathPNG = path.join(
  __dirname,
  "../src/__tests__/static/langfuse-logo.png",
);
const pdfPath = path.join(__dirname, "../src/__tests__/static/bitcoin.pdf");
const audioPath = path.join(
  __dirname,
  "../src/__tests__/static/sounds-of-mars-one-small-step-earth.wav",
);

const imageBytes = fs.readFileSync(imagePathPNG);
const pdfBytes = fs.readFileSync(pdfPath);
const audioBytes = fs.readFileSync(audioPath);

interface MediaFile {
  contentType: string;
  contentLength: number;
  sha256Hash: string;
  fileBytes: Buffer;
}

const files: Record<string, MediaFile> = {
  image: {
    contentType: "image/png",
    contentLength: imageBytes.length,
    sha256Hash: crypto.createHash("sha256").update(imageBytes).digest("base64"),
    fileBytes: imageBytes,
  },
  pdf: {
    contentType: "application/pdf",
    contentLength: pdfBytes.length,
    sha256Hash: crypto.createHash("sha256").update(pdfBytes).digest("base64"),
    fileBytes: pdfBytes,
  },
  audio: {
    contentType: "audio/wav",
    contentLength: audioBytes.length,
    sha256Hash: crypto.createHash("sha256").update(audioBytes).digest("base64"),
    fileBytes: audioBytes,
  },
};

async function uploadMedia(
  traceId: string,
  field: "input" | "output" | "metadata",
  file: MediaFile,
): Promise<void> {
  // Get upload URL
  const uploadUrlResponse = await fetch(`${API_BASE}/api/public/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({
      traceId,
      field,
      contentType: file.contentType,
      contentLength: file.contentLength,
      sha256Hash: file.sha256Hash,
    }),
  });

  const uploadUrlData = await uploadUrlResponse.json();
  const { uploadUrl, mediaId } = uploadUrlData;

  if (!uploadUrl) {
    console.log(`  ✓ Media already uploaded for ${field}`);
    return;
  }

  // Upload file to S3
  // Convert Buffer to ArrayBuffer for Node.js v24+ compatibility with fetch
  const arrayBuffer = file.fileBytes.buffer.slice(
    file.fileBytes.byteOffset,
    file.fileBytes.byteOffset + file.fileBytes.byteLength,
  ) as ArrayBuffer;
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: arrayBuffer,
    headers: {
      "Content-Type": file.contentType,
      "X-Amz-Checksum-Sha256": file.sha256Hash,
    },
  });

  // Update media record
  await fetch(`${API_BASE}/api/public/media/${mediaId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({
      uploadedAt: new Date().toISOString(),
      uploadHttpStatus: uploadResponse.status,
      uploadHttpError: uploadResponse.ok ? null : await uploadResponse.text(),
    }),
  });

  console.log(`  ✓ Uploaded ${file.contentType} to ${field}`);
}

async function createTrace(
  traceId: string,
  name: string,
  input?: unknown,
  output?: unknown,
  metadata?: unknown,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/public/traces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({
      id: traceId,
      name,
      projectId: PROJECT_ID,
      input,
      output,
      metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create trace: ${error}`);
  }

  console.log(`✓ Created trace: ${name}`);
}

async function main() {
  console.log("Creating test traces with media attachments...\n");

  // Trace 1: Image only (input)
  const trace1Id = "test-media-image-only";
  await createTrace(trace1Id, "Test: Image Only (Input)", {
    message: "This trace has an image in input",
  });
  await uploadMedia(trace1Id, "input", files.image);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace1Id}\n`);

  // Trace 2: PDF only (output)
  const trace2Id = "test-media-pdf-only";
  await createTrace(trace2Id, "Test: PDF Only (Output)", undefined, {
    message: "This trace has a PDF in output",
  });
  await uploadMedia(trace2Id, "output", files.pdf);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace2Id}\n`);

  // Trace 3: Audio only (metadata)
  const trace3Id = "test-media-audio-only";
  await createTrace(
    trace3Id,
    "Test: Audio Only (Metadata)",
    undefined,
    undefined,
    { message: "This trace has audio in metadata" },
  );
  await uploadMedia(trace3Id, "metadata", files.audio);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace3Id}\n`);

  // Trace 4: Image + PDF (input + output)
  const trace4Id = "test-media-image-pdf";
  await createTrace(
    trace4Id,
    "Test: Image + PDF",
    { message: "Image in input" },
    { message: "PDF in output" },
  );
  await uploadMedia(trace4Id, "input", files.image);
  await uploadMedia(trace4Id, "output", files.pdf);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace4Id}\n`);

  // Trace 5: All three types
  const trace5Id = "test-media-all-types";
  await createTrace(
    trace5Id,
    "Test: All Media Types",
    { message: "Image in input" },
    { message: "PDF in output" },
    { message: "Audio in metadata" },
  );
  await uploadMedia(trace5Id, "input", files.image);
  await uploadMedia(trace5Id, "output", files.pdf);
  await uploadMedia(trace5Id, "metadata", files.audio);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace5Id}\n`);

  // Trace 6: Multiple files in one section (all in input)
  const trace6Id = "test-media-multiple-input";
  await createTrace(trace6Id, "Test: Multiple Files (Input)", {
    message: "Multiple files in input section",
  });
  await uploadMedia(trace6Id, "input", files.image);
  await uploadMedia(trace6Id, "input", files.pdf);
  await uploadMedia(trace6Id, "input", files.audio);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace6Id}\n`);

  // Trace 7: Complex - multiple files in multiple sections
  const trace7Id = "test-media-complex";
  await createTrace(
    trace7Id,
    "Test: Complex Multi-Media",
    { message: "Image + PDF in input" },
    { message: "PDF + Audio in output" },
    { message: "All types in metadata" },
  );
  await uploadMedia(trace7Id, "input", files.image);
  await uploadMedia(trace7Id, "input", files.pdf);
  await uploadMedia(trace7Id, "output", files.pdf);
  await uploadMedia(trace7Id, "output", files.audio);
  await uploadMedia(trace7Id, "metadata", files.image);
  await uploadMedia(trace7Id, "metadata", files.pdf);
  await uploadMedia(trace7Id, "metadata", files.audio);
  console.log(`  → ${API_BASE}/project/${PROJECT_ID}/traces/${trace7Id}\n`);

  console.log("✅ Done! All test traces created successfully.");
  console.log(
    "\nTo test the UI, open any of the trace URLs above and switch to 'JSON Beta' view.",
  );
}

main().catch(console.error);
