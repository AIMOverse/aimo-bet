"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Image as ImageIcon,
  FileText,
  Code,
  File,
  Download,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { LibraryFile } from "@/types/library";
import { formatFileSize, getCategoryLabel, getSourceLabel } from "@/types/library";

interface FilePreviewProps {
  file: LibraryFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (file: LibraryFile) => void;
  onDelete: (file: LibraryFile) => void;
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "image":
      return ImageIcon;
    case "document":
      return FileText;
    case "code":
      return Code;
    default:
      return File;
  }
}

export function FilePreview({
  file,
  open,
  onOpenChange,
  onDownload,
  onDelete,
}: FilePreviewProps) {
  const [imageError, setImageError] = useState(false);

  if (!file) return null;

  const Icon = getCategoryIcon(file.category);
  const isImage = file.category === "image" && file.url && !imageError;
  const isPdf = file.contentType === "application/pdf" && file.url;

  const handleDelete = () => {
    onDelete(file);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate pr-8">
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">{file.name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex-1 min-h-0 overflow-auto">
          {isImage ? (
            <div className="relative w-full h-full min-h-[300px] flex items-center justify-center bg-muted rounded-md">
              <Image
                src={file.url!}
                alt={file.name}
                width={800}
                height={600}
                className="max-w-full max-h-[60vh] object-contain"
                onError={() => setImageError(true)}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={file.url}
              className="w-full h-[60vh] rounded-md border"
              title={file.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 bg-muted rounded-md">
              <Icon className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Preview not available</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => file.url && window.open(file.url, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in new tab
              </Button>
            </div>
          )}
        </div>

        {/* File info */}
        <div className="flex flex-wrap gap-2 py-2">
          <Badge variant="secondary">{getCategoryLabel(file.category)}</Badge>
          <Badge variant="outline">{getSourceLabel(file.sourceType)}</Badge>
          <Badge variant="outline">{formatFileSize(file.size)}</Badge>
          <Badge variant="outline">
            {file.createdAt.toLocaleDateString()}
          </Badge>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button onClick={() => onDownload(file)}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
