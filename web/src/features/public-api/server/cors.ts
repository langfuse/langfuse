import { type NextApiRequest, type NextApiResponse } from "next";
import Cors from "cors";

export function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  // eslint-disable-next-line @typescript-eslint/ban-types
  fn: Function,
) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}

export const cors = Cors({
  origin: true,
  //update: or "origin: true," if you don't wanna add a specific one
  credentials: false,
});
