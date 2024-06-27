import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { isPrismaException } from "@/src/utils/exceptions";
import { NextApiRequest, NextApiResponse } from "next";
import { Client } from 'pg';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "POST") {
    try {
      const query  = req.body;
      const client = new Client({connectionString : process.env.DATABASE_URL});
      await client.connect();
      const result = await client.query(query);
      await client.end();
      return res.status(200).json(result.rows);
    } catch (error) {
      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
        });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  } else {
    console.error(
      `Method not allowed for ${req.method} on /api/public/dashboard`,
    );
    return res.status(405).json({ message: "Method not allowed" });
  }
}