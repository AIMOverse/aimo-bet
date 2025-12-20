import type { FileCategory, FileSourceType } from "@/lib/supabase/types";

/**
 * Library file for UI usage
 */
export interface LibraryFile {
  id: string;
  name: string;
  storagePath: string;
  contentType: string;
  size: number;
  sourceType: FileSourceType;
  sourceId: string | null;
  category: FileCategory;
  createdAt: Date;
  url?: string;
}

/**
 * View mode for library display
 */
export type ViewMode = "grid" | "list";

/**
 * Sort options for library
 */
export type SortBy = "date" | "name" | "size" | "type";

/**
 * Filter state for library
 */
export interface LibraryFilters {
  category: FileCategory | "all";
  sourceType: FileSourceType | "all";
  search: string;
  sortBy: SortBy;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get icon name for file category
 */
export function getCategoryIcon(category: FileCategory): string {
  switch (category) {
    case "image":
      return "Image";
    case "document":
      return "FileText";
    case "code":
      return "Code";
    default:
      return "File";
  }
}

/**
 * Get display label for category
 */
export function getCategoryLabel(category: FileCategory | "all"): string {
  switch (category) {
    case "all":
      return "All Files";
    case "image":
      return "Images";
    case "document":
      return "Documents";
    case "code":
      return "Code";
    default:
      return "Other";
  }
}

/**
 * Get display label for source type
 */
export function getSourceLabel(sourceType: FileSourceType | "all"): string {
  switch (sourceType) {
    case "all":
      return "All Sources";
    case "chat":
      return "Chat";
    case "generated":
      return "Generated";
    case "uploaded":
      return "Uploaded";
  }
}
