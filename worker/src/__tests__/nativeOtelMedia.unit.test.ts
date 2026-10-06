import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { validateOtelJson } from "@langfuse/native";
import { MediaContentType } from "@langfuse/shared";

it("extracts every MIME type supported by the TypeScript media service", async () => {
  const contentTypes = Object.values(MediaContentType);
  const validated = await validateOtelJson(
    Buffer.from(
      JSON.stringify(contentTypes.map((type) => `data:${type};base64,aGk=`)),
    ),
  );
  const batch = await validated.extract(true);
  try {
    expect(batch.media.map((media) => media.contentType)).toEqual(contentTypes);
    expect(JSON.parse(batch.json())).toEqual(
      batch.media.map((media) => media.reference),
    );
  } finally {
    await batch.dispose();
    await validated.dispose();
  }
});

it("owns input snapshots and in-flight media reads across handle disposal", async () => {
  const uri = "data:image/png;base64,aGk=";
  const source = Buffer.from(JSON.stringify({ input: uri }));
  const validation = validateOtelJson(source);
  source.fill(0); // JS retains a mutable Buffer; the async validator must own its snapshot.
  const validated = await validation;
  const batch = await validated.extract(true);
  try {
    await expect(validated.extract(true)).rejects.toThrow("already extracted");
    const [media] = batch.media;
    expect(JSON.parse(batch.json())).toEqual({ input: media.reference });
    expect(media.sha256Hash).toBe(
      createHash("sha256").update("hi").digest("base64"),
    );
    await expect(batch.mediaBody(1)).rejects.toThrow("unknown media index");

    const body = batch.mediaBody(media.index);
    const original = batch.originalMedia(media.index);
    await batch.dispose();
    await expect(body).resolves.toEqual(Buffer.from("hi"));
    await expect(original).resolves.toBe(uri);
    expect(() => batch.json()).toThrow("already disposed");
    expect(() => batch.mediaBody(0)).toThrow("already disposed");
  } finally {
    await batch.dispose();
    await validated.dispose();
  }
});
