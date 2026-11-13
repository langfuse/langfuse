import { LangfuseClient } from "@langfuse/client";
import { z } from "zod/v4";
import type {
  SkillSource,
  SkillSourceEntry,
  SkillSourceStat,
} from "@mastra/core/workspace";
import {
  SkillFilePathSchema,
  SkillNameSchema,
  SkillVersionSchema,
  type SkillVersionResponse,
} from "@langfuse/shared";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";
import { LANGFUSE_HALO_SKILLS } from "@repo/langfuse-skills";

export type SkillsConfig = {
  tag?: string;
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
  signal?: AbortSignal;
};

const fileContentsSchema = z.object({
  data: z.array(z.object({ sha256Hash: z.string(), content: z.string() })),
});

const skillWithContentSchema = SkillVersionSchema.extend({
  files: z.array(
    SkillVersionSchema.shape.files.element.extend({
      content: z.string().optional(),
    }),
  ),
});

/** Read-only virtual /skills tree; Mastra owns discovery and skill parsing. */
export class InAppAgentSkillSource implements SkillSource {
  private readonly contents = new Map<string, Promise<string>>();
  private readonly skills = new Map<
    string,
    Promise<SkillVersionResponse | null>
  >();
  private client?: LangfuseClient;

  constructor(private readonly config: SkillsConfig = {}) {}

  async exists(path: string): Promise<boolean> {
    const { name, relativePath } = parsePath(path);
    this.config.signal?.throwIfAborted();
    if (!name) return true;
    const skill = await this.getSkill(name);
    return !!skill && !!findEntry(skill.files, relativePath);
  }

  async stat(path: string): Promise<SkillSourceStat> {
    const { name, relativePath } = parsePath(path);
    this.config.signal?.throwIfAborted();
    if (!name) {
      return {
        name: "skills",
        type: "directory",
        size: 0,
        createdAt: new Date(0),
        modifiedAt: new Date(0),
      };
    }
    const skill = await this.getSkill(name);
    const entry = skill && findEntry(skill.files, relativePath);
    if (!skill || !entry) throw new Error(`Skill path not found: ${path}`);
    return {
      name: relativePath.split("/").at(-1) || name,
      type: entry.type,
      size: entry.type === "file" ? entry.file.contentLength : 0,
      createdAt: new Date(skill.createdAt),
      modifiedAt: new Date(skill.updatedAt),
    };
  }

  async readFile(path: string): Promise<string> {
    const { name, relativePath } = parsePath(path);
    if (!name || !relativePath) throw new Error(`Not a skill file: ${path}`);
    const skill = await this.getSkill(name);
    const file = skill?.files.find((file) => file.path === relativePath);
    if (!skill || !file) throw new Error(`Skill file not found: ${path}`);
    const content = await this.getFileContent(file.sha256Hash);
    if (relativePath !== "SKILL.md" || !skill.projectId) return content;

    const frontmatter = z
      .looseObject({ metadata: z.record(z.string(), z.unknown()).catch({}) })
      .parse(skill.frontmatter);
    // Pass hosted version metadata through Mastra to the trace linker.
    return content.replace(
      /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,
      () =>
        `---\n${JSON.stringify({
          ...frontmatter,
          metadata: {
            ...frontmatter.metadata,
            langfuseProjectId: skill.projectId,
            langfuseSkillVersion: skill.version,
          },
        })}\n---\n`,
    );
  }

  async readdir(path: string): Promise<SkillSourceEntry[]> {
    const { name, relativePath } = parsePath(path);
    if (!name) return this.listRoot();

    const skill = await this.getSkill(name);
    const entry = skill ? findEntry(skill.files, relativePath) : null;
    if (!skill || entry?.type !== "directory")
      throw new Error(`Skill directory not found: ${path}`);

    const prefix = relativePath ? `${relativePath}/` : "";
    const entries = new Map<string, SkillSourceEntry>();
    for (const file of skill.files) {
      if (!file.path.startsWith(prefix)) continue;
      const [child, ...rest] = file.path.slice(prefix.length).split("/");
      entries.set(child, {
        name: child,
        type: rest.length ? "directory" : "file",
      });
    }
    return [...entries.values()];
  }

  private async listRoot(): Promise<SkillSourceEntry[]> {
    this.config.signal?.throwIfAborted();
    const entries = new Set(
      LANGFUSE_HALO_SKILLS.map(({ frontmatter }) => frontmatter.name),
    );
    if (this.config.tag) {
      try {
        const catalogue = await this.skillsApi.list(
          { tag: this.config.tag, limit: 100 },
          this.requestOptions(),
        );
        for (const entry of catalogue.data) {
          if (entry.productionVersion === null) continue;
          entries.add(entry.name);
        }
      } catch (error) {
        this.config.signal?.throwIfAborted();
        logger.warn("Failed to list hosted skills; using repository skills", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    this.config.signal?.throwIfAborted();
    return Array.from(entries.values()).map(
      (name): SkillSourceEntry => ({
        name,
        type: "directory",
      }),
    );
  }

  private async getSkill(name: string): Promise<SkillVersionResponse | null> {
    this.config.signal?.throwIfAborted();
    const cached = this.skills.get(name);
    if (cached) return cached;

    const pending = this.config.tag
      ? this.fetchHostedSkill(name)
          .then((skill) => skill ?? this.getRepoSkill(name))
          .catch(() => {
            this.config.signal?.throwIfAborted();
            return this.getRepoSkill(name);
          })
      : this.getRepoSkill(name);
    this.skills.set(name, pending);
    return pending;
  }

  private async getRepoSkill(name: string) {
    const skill = LANGFUSE_HALO_SKILLS.find(
      (skill) => skill.frontmatter.name === name,
    );
    if (!skill) return null;

    const files = skill.resources.map((resource) => {
      const { uri, path, digest, size } = resource;
      this.contents.set(digest, Promise.resolve(resource.text));
      return {
        id: uri,
        path,
        blobId: digest,
        sha256Hash: digest,
        contentType: resource.mimeType,
        contentLength: size,
      };
    });
    return SkillVersionSchema.parse({
      id: skill.uri,
      name,
      description: skill.frontmatter.description,
      frontmatter: skill.frontmatter,
      version: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      projectId: "",
      createdBy: "",
      tags: [],
      labels: [],
      commitMessage: null,
      files,
    });
  }

  private async fetchHostedSkill(
    name: string,
  ): Promise<SkillVersionResponse | null> {
    const result = await this.skillsApi
      .get(
        name,
        { label: "production", includeContent: true },
        this.requestOptions(),
      )
      .catch((error: unknown) => {
        this.config.signal?.throwIfAborted();
        if (
          error instanceof Error &&
          "statusCode" in error &&
          error.statusCode === 404
        )
          return null;
        throw error;
      });
    if (result === null) return null;
    const skill = skillWithContentSchema.parse(result);
    skill.files.forEach((f) => {
      if (f.content !== undefined)
        this.contents.set(f.sha256Hash, Promise.resolve(f.content));
    });
    return skill.tags.includes(this.config.tag!) ? skill : null;
  }

  private async getFileContent(sha256Hash: string): Promise<string> {
    this.config.signal?.throwIfAborted();
    const cached = this.contents.get(sha256Hash);
    if (cached) return cached;
    const pending = (async () => {
      const response = fileContentsSchema.parse(
        await this.skillsApi.getFileContents(
          { sha256Hashes: sha256Hash },
          this.requestOptions(),
        ),
      );
      const content = response.data.find(
        (entry) => entry.sha256Hash === sha256Hash,
      )?.content;
      if (content === undefined) {
        throw new Error(
          "Managed assistant skill content did not match its selected file",
        );
      }
      return content;
    })().catch((error: unknown) => {
      this.contents.delete(sha256Hash);
      throw error;
    });
    this.contents.set(sha256Hash, pending);
    return pending;
  }

  private get skillsApi() {
    if (!this.config.publicKey || !this.config.secretKey)
      throw new Error(
        "Managed assistant skills require AI-features project credentials",
      );
    if (!this.client) {
      this.client = new LangfuseClient({
        baseUrl: this.config.baseUrl ?? getProductBaseUrl().toString(),
        publicKey: this.config.publicKey,
        secretKey: this.config.secretKey,
      });
    }
    return this.client.api.skills;
  }

  private requestOptions() {
    this.config.signal?.throwIfAborted();
    return {
      timeoutInSeconds: 1,
      maxRetries: 0,
      abortSignal: this.config.signal,
    };
  }
}

function parsePath(path: string): { name?: string; relativePath: string } {
  const normalized = path.replace(/\/$/, "");
  if (normalized === "/skills") return { relativePath: "" };
  if (!normalized.startsWith("/skills/"))
    throw new Error(`Invalid skill path: ${path}`);
  const [name, ...parts] = normalized.slice("/skills/".length).split("/");
  SkillNameSchema.parse(name);
  const relativePath = parts.join("/");
  if (relativePath) SkillFilePathSchema.parse(relativePath);
  return { name, relativePath };
}

function findEntry(files: SkillVersionResponse["files"], path: string) {
  const file = files.find((entry) => entry.path === path);
  if (file) return { type: "file" as const, file };
  if (!path || files.some((entry) => entry.path.startsWith(`${path}/`)))
    return { type: "directory" as const };
  return null;
}
