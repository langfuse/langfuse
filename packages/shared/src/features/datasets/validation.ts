import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";

/**
 * Dataset name validation schema for API, tRPC and client
 */
export const DatasetNameSchema = withFolderPathValidation(StringNoHTMLNonEmpty);
