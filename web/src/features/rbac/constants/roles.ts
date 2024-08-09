import { z } from "zod";

export const Role = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"]);

export type Role = z.infer<typeof Role>;
