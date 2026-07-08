/*
  Warnings:

  - Changed the type of `data_type` on the `score_configs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- Rename enum
ALTER TYPE "ScoreDataType" RENAME TO "ScoreConfigDataType";