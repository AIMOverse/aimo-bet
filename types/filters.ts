/**
 * Store Filters Types
 */

export type StoreTab = "model" | "agent" | "tool";
export type ViewMode = "grid" | "list";

export interface StoreFilters {
  search: string;
  providers: string[];
  categories: string[];
  tab: StoreTab;
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}
