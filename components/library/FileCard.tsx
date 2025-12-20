"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Image as ImageIcon,
  FileText,
  Code,
  File,
  MoreVertical,
  Download,
  Trash2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LibraryFile, ViewMode } from "@/types/library";
import { formatFileSize } from "@/types/library";

interface FileCardProps {
  file: LibraryFile;
  viewMode: ViewMode;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onPreview: (file: LibraryFile) => void;
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

export function FileCard({
  file,
  viewMode,
  selected,
  onSelect,
  onPreview,
  onDownload,
  onDelete,
}: FileCardProps) {
  const [imageError, setImageError] = useState(false);
  const Icon = getCategoryIcon(file.category);
  const isImage = file.category === "image" && file.url && !imageError;

  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group",
          selected && "bg-muted"
        )}
        onClick={() => onPreview(file)}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(file.id, !!checked)}
          onClick={(e) => e.stopPropagation()}
        />

        <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
          {isImage ? (
            <Image
              src={file.url!}
              alt={file.name}
              width={40}
              height={40}
              className="object-cover w-full h-full"
              onError={() => setImageError(true)}
            />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)} · {file.createdAt.toLocaleDateString()}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPreview(file)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload(file)}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(file)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Grid view
  return (
    <Card
      className={cn(
        "group relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all",
        selected && "ring-2 ring-primary"
      )}
      onClick={() => onPreview(file)}
    >
      {/* Checkbox */}
      <div
        className="absolute top-2 left-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(file.id, !!checked)}
          className="bg-background/80 backdrop-blur"
        />
      </div>

      {/* Actions */}
      <div
        className="absolute top-2 right-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPreview(file)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload(file)}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(file)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Thumbnail */}
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {isImage ? (
          <Image
            src={file.url!}
            alt={file.name}
            width={200}
            height={200}
            className="object-cover w-full h-full"
            onError={() => setImageError(true)}
          />
        ) : (
          <Icon className="h-12 w-12 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatFileSize(file.size)}
        </p>
      </div>
    </Card>
  );
}
