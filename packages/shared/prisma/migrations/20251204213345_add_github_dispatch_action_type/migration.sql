-- Migration: Add GitHub Dispatch Action Type
-- This migration adds support for GitHub repository dispatch actions by:
-- 1. Adding GITHUB_DISPATCH to the ActionType enum

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'GITHUB_DISPATCH';
