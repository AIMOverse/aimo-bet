"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Trash2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { FileCard } from "./FileCard";
import { FileFilters } from "./FileFilters";
import { FilePreview } from "./FilePreview";
import type {
  LibraryFile,
  ViewMode,
  LibraryFilters,
  SortBy,
} from "@/types/library";
import type { FileCategory, FileSourceType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const DEFAULT_FILTERS: LibraryFilters = {
  category: "all",
  sourceType: "all",
  search: "",
  sortBy: "date",
};

export function LibraryContent() {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch files
  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.category !== "all") {
        params.set("category", filters.category);
      }
      if (filters.sourceType !== "all") {
        params.set("sourceType", filters.sourceType);
      }
      if (filters.search) {
        params.set("search", filters.search);
      }

      const response = await fetch(`/api/library?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch files");

      const data = await response.json();
      const filesWithDates = data.files.map(
        (f: LibraryFile & { createdAt: string }) => ({
          ...f,
          createdAt: new Date(f.createdAt),
        }),
      );
      setFiles(filesWithDates);
    } catch (error) {
      console.error("Failed to fetch files:", error);
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.sourceType, filters.search]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...files];
    switch (filters.sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "size":
        sorted.sort((a, b) => b.size - a.size);
        break;
      case "type":
        sorted.sort((a, b) => a.category.localeCompare(b.category));
        break;
      case "date":
      default:
        sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return sorted;
  }, [files, filters.sortBy]);

  // Handle file selection
  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  // Handle file upload
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      setUploading(true);
      try {
        for (const file of Array.from(fileList)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("sourceType", "uploaded");

          const response = await fetch("/api/library", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) throw new Error(`Failed to upload ${file.name}`);
        }

        toast.success(
          fileList.length === 1
            ? "File uploaded successfully"
            : `${fileList.length} files uploaded successfully`,
        );
        fetchFiles();
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error("Failed to upload files");
      } finally {
        setUploading(false);
        // Reset input
        e.target.value = "";
      }
    },
    [fetchFiles],
  );

  // Handle file download
  const handleDownload = useCallback(async (file: LibraryFile) => {
    if (!file.url) {
      // Fetch fresh URL
      const response = await fetch(`/api/library/${file.id}`);
      if (!response.ok) {
        toast.error("Failed to get download link");
        return;
      }
      const data = await response.json();
      file = { ...file, url: data.url };
    }

    const link = document.createElement("a");
    link.href = file.url!;
    link.download = file.name;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Handle file delete
  const handleDelete = useCallback(async (file: LibraryFile) => {
    try {
      const response = await fetch(`/api/library/${file.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete file");

      toast.success("File deleted");
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete file");
    }
  }, []);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      const ids = Array.from(selectedIds).join(",");
      const response = await fetch(`/api/library?ids=${ids}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete files");

      toast.success(`${selectedIds.size} files deleted`);
      setFiles((prev) => prev.filter((f) => !selectedIds.has(f.id)));
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast.error("Failed to delete files");
    }
  }, [selectedIds]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-xl font-semibold">Library</h1>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" disabled={uploading} asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading..." : "Upload"}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b">
        <FileFilters
          filters={filters}
          onFiltersChange={setFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                : "space-y-2",
            )}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className={viewMode === "grid" ? "aspect-square" : "h-14"}
              />
            ))}
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium mb-1">No files yet</h2>
            <p className="text-muted-foreground mb-4">
              Upload files to get started
            </p>
            <Button asChild>
              <label className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                Upload files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                : "space-y-1",
            )}
          >
            {sortedFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode={viewMode}
                selected={selectedIds.has(file.id)}
                onSelect={handleSelect}
                onPreview={setPreviewFile}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <FilePreview
        file={previewFile}
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        onDownload={handleDownload}
        onDelete={handleDelete}
      />
    </div>
  );
}
