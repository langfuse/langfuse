import { sendProjectInvitation } from "@/src/features/email/lib/project-invitation";
import { NextApiRequest, NextApiResponse } from "next";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const result = await sendProjectInvitation("tmeemu15@gmail.com", "Tameem Asim", "tutu");
    res.status(200).json(result);
  } catch (error) {
    console.error(error);

    res.status(400).json(error);
  }
}
