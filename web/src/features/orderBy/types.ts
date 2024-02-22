import { type orderBy } from "@/src/server/api/interfaces/orderBy";
import { type z } from "zod";

// to be sent to the server
export type OrderByState = z.infer<typeof orderBy>;
