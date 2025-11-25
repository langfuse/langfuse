-- Database migration to add PIVOT_TABLE chart type to DashboardWidgetChartType enum
-- This enables the creation of pivot table widgets in the dashboard system
-- 
-- This migration adds support for tabular data visualization with configurable
-- row dimensions and metrics, extending the existing widget types (line charts,
-- bar charts, pie charts, etc.) to include pivot table functionality.

-- AlterEnum
ALTER TYPE "DashboardWidgetChartType" ADD VALUE 'PIVOT_TABLE'; 