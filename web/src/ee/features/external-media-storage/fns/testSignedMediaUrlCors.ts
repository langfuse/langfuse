export async function testSignedMediaUrlCors(signedUrl: string) {
  let response: Response;
  try {
    response = await fetch(signedUrl, {
      cache: "no-store",
      credentials: "omit",
      headers: { Range: "bytes=0-0" },
      mode: "cors",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new Error(
      "The browser could not read the signed URL. Check the bucket CORS policy for this Langfuse origin.",
    );
  }

  try {
    if (!response.ok) {
      throw new Error(
        `The browser request returned HTTP ${response.status}. Check the bucket CORS policy and object access.`,
      );
    }
  } finally {
    await response.body?.cancel();
  }
}
