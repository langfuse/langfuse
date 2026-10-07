import { Unzip, UnzipInflate, unzipSync } from "fflate";
import { z } from "zod/v4";
import {
  CreateSkillVersionBodySchema,
  InvalidRequestError,
  SkillFilePathSchema,
} from "@langfuse/shared";
import { parseSkillFrontmatterMetadata } from "@/src/features/skills/utils/parseSkillFrontmatterMetadata";

const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;

export function readSkillArchive(archive: Uint8Array) {
  if (archive.byteLength > 10 * 1024 * 1024) {
    throw new InvalidRequestError("This archive is too large to import.");
  }
  const declaredSizes = new Map<string, number>();
  const entries = new Map<string, Uint8Array>();
  let declaredBytes = 0;
  let expandedBytes = 0;
  try {
    // Read the central directory without inflating content or trusting its sizes.
    unzipSync(archive, {
      filter: (entry) => {
        declaredBytes += entry.originalSize;
        if (
          declaredBytes > MAX_EXPANDED_BYTES ||
          declaredSizes.size >= 10_000
        ) {
          throw new InvalidRequestError("This archive is too large to import.");
        }
        if (declaredSizes.has(entry.name)) {
          throw new InvalidRequestError(
            "The archive contains duplicate paths.",
          );
        }
        declaredSizes.set(entry.name, entry.originalSize);
        return false;
      },
    });
    const started = new Set<string>();
    const unzip = new Unzip((file) => {
      const expectedSize = declaredSizes.get(file.name);
      if (
        expectedSize === undefined ||
        started.has(file.name) ||
        (file.originalSize !== undefined && file.originalSize !== expectedSize)
      ) {
        throw new InvalidRequestError(
          "This ZIP archive has inconsistent file metadata.",
        );
      }
      started.add(file.name);
      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        fileBytes += chunk.byteLength;
        expandedBytes += chunk.byteLength;
        if (expandedBytes > MAX_EXPANDED_BYTES) {
          throw new InvalidRequestError("This archive is too large to import.");
        }
        if (fileBytes > expectedSize || (final && fileBytes !== expectedSize)) {
          throw new InvalidRequestError(
            "This ZIP archive has inconsistent file sizes.",
          );
        }
        chunks.push(chunk);
        if (final) {
          const bytes = new Uint8Array(fileBytes);
          let offset = 0;
          for (const part of chunks) {
            bytes.set(part, offset);
            offset += part.byteLength;
          }
          entries.set(file.name, bytes);
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    // Bound each inflate operation so a forged ZIP cannot expand in one allocation.
    for (let offset = 0; offset < archive.byteLength; offset += 1024) {
      unzip.push(
        archive.subarray(offset, offset + 1024),
        offset + 1024 >= archive.byteLength,
      );
    }
    if (entries.size !== declaredSizes.size) {
      throw new InvalidRequestError("This ZIP archive is incomplete.");
    }
  } catch (error) {
    if (error instanceof InvalidRequestError) throw error;
    throw new InvalidRequestError("This file is not a valid ZIP archive.");
  }
  return [...entries]
    .filter(([path]) => !path.endsWith("/"))
    .map(([path, bytes]) => ({ path, bytes }));
}

export function discoverFileSkills({
  files: inputFiles,
  fallbackName,
}: {
  files: { path: string; bytes: Uint8Array }[];
  fallbackName: string;
}) {
  const files = inputFiles.filter(
    ({ path }) =>
      !path
        .split("/")
        .some((part) => part === "__MACOSX" || part === ".DS_Store"),
  );
  const skillFiles = files.filter(
    ({ path }) => path.split("/").at(-1)?.toLowerCase() === "skill.md",
  );
  if (skillFiles.length > 100)
    throw new InvalidRequestError(
      "A source can contain at most 100 skills per import.",
    );
  const directories = new Map<string, typeof skillFiles>();
  for (const skillFile of skillFiles) {
    const directory = skillFile.path.slice(
      0,
      skillFile.path.lastIndexOf("/") + 1,
    );
    directories.set(directory, [
      ...(directories.get(directory) ?? []),
      skillFile,
    ]);
  }
  const discovered = [...directories].map(([directory, candidates]) => {
    const skillFile = candidates[0]!;
    const path = directory.slice(0, -1) || ".";
    const fallback = {
      path,
      name: path === "." ? fallbackName : path.split("/").at(-1)!,
      description: "",
      files: [] as { path: string; content: string }[],
    };
    try {
      if (candidates.length > 1)
        throw new InvalidRequestError(
          "This directory contains multiple SKILL.md files with different casing.",
        );
      SkillFilePathSchema.parse(skillFile.path);
      const input = CreateSkillVersionBodySchema.parse({
        files: files
          .filter((file) => file.path.startsWith(directory))
          .map((file) => ({
            path:
              file.path === skillFile.path
                ? "SKILL.md"
                : file.path.slice(directory.length),
            content: new TextDecoder("utf-8", {
              fatal: true,
              ignoreBOM: true,
            }).decode(file.bytes),
          })),
      });
      const importedFiles = input.files.map((file) => ({
        path: file.path,
        content: file.content!,
      }));
      const metadata = parseSkillFrontmatterMetadata(
        importedFiles.find((file) => file.path === "SKILL.md")!.content,
      );
      if (!metadata || metadata.nameError || !metadata.description)
        throw new InvalidRequestError(
          "SKILL.md must have valid YAML frontmatter with a name and description.",
        );
      return {
        path,
        name: metadata.name.trim(),
        description: metadata.description,
        files: importedFiles,
        error: null,
      };
    } catch (error) {
      let message = "Invalid skill files.";
      if (error instanceof Error) message = error.message;
      if (error instanceof z.ZodError)
        message = error.issues[0]?.message ?? message;
      return {
        ...fallback,
        error: message,
      };
    }
  });
  const names = new Map<string, number>();
  for (const skill of discovered) {
    if (!skill.error) names.set(skill.name, (names.get(skill.name) ?? 0) + 1);
  }
  const skills = discovered.map((skill) =>
    !skill.error && names.get(skill.name)! > 1
      ? {
          ...skill,
          files: [],
          error:
            "Multiple skills in this source have the same name. Give them unique names before importing.",
        }
      : skill,
  );
  if (
    new TextEncoder().encode(JSON.stringify(skills)).byteLength >
    MAX_RESPONSE_BYTES
  ) {
    throw new InvalidRequestError(
      "The discovered skills are too large to import together.",
    );
  }
  return skills;
}
