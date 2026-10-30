-- Migration: Add PagerDuty Action Type
-- This migration adds support for PagerDuty actions by:
-- 1. Adding PAGERDUTY to the ActionType enum

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'PAGERDUTY';
