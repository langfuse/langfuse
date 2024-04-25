import { Router } from "express";

const router = Router();

type EmojiResponse = string[];

router.get<{}, EmojiResponse>("/", (req, res) => {
  res.json(["😀"]);
});

export default router;
