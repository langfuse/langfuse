import { Widget } from "./widget";

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  widgets: Widget[];
  globalFilters: FilterConfiguration[];
}