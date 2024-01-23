const ALGORITHM = "AES-CBC";

export const generateKey = async () =>
  JSON.stringify(
    await crypto.subtle.exportKey(
      "jwk",
      await crypto.subtle.generateKey({ name: ALGORITHM, length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]),
    ),
  );

const importKey = async (key: string) =>
  await crypto.subtle.importKey(
    "jwk",
    JSON.parse(key) as JsonWebKey,
    { name: ALGORITHM, length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

export const encrypt = async (key: string, text: string) => {
  const importedKey = await importKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encryptedText = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    importedKey,
    new TextEncoder().encode(text),
  );
  return Buffer.concat([iv, new Uint8Array(encryptedText)]);
};

export const decrypt = async (key: string, data: Buffer) => {
  const importedKey = await importKey(key);
  const iv = data.subarray(0, 16);
  const buffer = data.subarray(16);
  const decryptedText = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    importedKey,
    buffer,
  );
  return new TextDecoder().decode(decryptedText);
};
