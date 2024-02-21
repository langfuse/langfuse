import { type NextApiRequest, type NextApiResponse } from "next";
import Cors from "cors";

// You can read more about the available options here: https://github.com/expressjs/cors#configuration-options
const cors = Cors({
  methods: ["POST", "GET", "HEAD"],
  origin: "*",
});

// Helper method to wait for a middleware to execute before continuing
// And to throw an error when an error happens in a middleware
export function runFeedbackCorsMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return new Promise((resolve, reject) => {
    cors(req, res, (result: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}
