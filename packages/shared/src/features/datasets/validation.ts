import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";

/**
 * Prompt name validation schema for API, tRPC and client
 */
export const DatasetNameSchema = withFolderPathValidation(StringNoHTMLNonEmpty);
