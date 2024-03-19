import express from "express";
import { multiply } from "shared";
const router = express.Router();

type EmojiResponse = string[];

router.get<{}, EmojiResponse>("/", (req, res) => {
  console.log("GET /emojis");
  res.json(["😀", "😳", "🙄", multiply(1, 2).toString()]);
});

export default router;
