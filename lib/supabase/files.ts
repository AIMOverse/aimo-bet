import { requireServerClient } from "./server";
import type {
  DbLibraryFile,
  DbLibraryFileInsert,
  FileSourceType,
  FileCategory,
} from "./types";

// =============================================================================
// Constants
// =============================================================================

const STORAGE_BUCKET = "library";

// MIME type to category mapping
const MIME_TO_CATEGORY: Record<string, FileCategory> = {
  // Images
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "image/bmp": "image",
  "image/tiff": "image",
  // Documents
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
  "text/plain": "document",
  "text/markdown": "document",
  "text/csv": "document",
  // Code
  "application/json": "code",
  "application/javascript": "code",
  "text/javascript": "code",
  "text/typescript": "code",
  "text/html": "code",
  "text/css": "code",
  "text/x-python": "code",
  "application/x-python": "code",
  "text/x-java": "code",
  "text/x-c": "code",
  "text/x-cpp": "code",
  "application/xml": "code",
  "text/xml": "code",
  "application/x-yaml": "code",
  "text/yaml": "code",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine file category from MIME type
 */
export function getCategoryFromMime(contentType: string): FileCategory {
  // Check exact match first
  if (MIME_TO_CATEGORY[contentType]) {
    return MIME_TO_CATEGORY[contentType];
  }

  // Check prefix matches
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("text/")) return "document";
  if (contentType.startsWith("application/json")) return "code";

  return "other";
}

/**
 * Generate a unique storage path for a file
 */
export function generateStoragePath(
  fileName: string,
  sourceType: FileSourceType
): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${sourceType}/${timestamp}-${randomSuffix}-${sanitizedName}`;
}

// =============================================================================
// Type Conversions
// =============================================================================

/**
 * Library file type for app usage
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
  url?: string; // Signed URL for access
}

/**
 * Convert database row to LibraryFile
 */
function dbToFile(row: DbLibraryFile): LibraryFile {
  return {
    id: row.id,
    name: row.name,
    storagePath: row.storage_path,
    contentType: row.content_type,
    size: row.size,
    sourceType: row.source_type,
    sourceId: row.source_id,
    category: row.category,
    createdAt: new Date(row.created_at),
  };
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Upload a file to storage and create database record
 */
export async function uploadFile(params: {
  file: Buffer | Uint8Array;
  fileName: string;
  contentType: string;
  sourceType: FileSourceType;
  sourceId?: string | null;
}): Promise<LibraryFile> {
  const supabase = requireServerClient();
  const { file, fileName, contentType, sourceType, sourceId } = params;

  const storagePath = generateStoragePath(fileName, sourceType);
  const category = getCategoryFromMime(contentType);

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  // Create database record
  const insert: DbLibraryFileInsert = {
    id: crypto.randomUUID(),
    name: fileName,
    storage_path: storagePath,
    content_type: contentType,
    size: file.length,
    source_type: sourceType,
    source_id: sourceId ?? null,
    category,
  };

  const { data: row, error: dbError } = await supabase
    .from("library_files")
    .insert(insert as never)
    .select()
    .single();

  if (dbError) {
    // Clean up uploaded file on database error
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`Failed to create file record: ${dbError.message}`);
  }

  return dbToFile(row as DbLibraryFile);
}

/**
 * Get all files with optional filters
 */
export async function getFiles(params?: {
  category?: FileCategory;
  sourceType?: FileSourceType;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ files: LibraryFile[]; total: number }> {
  const supabase = requireServerClient();
  const { category, sourceType, search, limit = 50, offset = 0 } = params ?? {};

  let query = supabase
    .from("library_files")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  if (sourceType) {
    query = query.eq("source_type", sourceType);
  }

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: rows, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get files: ${error.message}`);
  }

  const files = (rows as DbLibraryFile[]).map(dbToFile);

  return { files, total: count ?? 0 };
}

/**
 * Get a single file by ID
 */
export async function getFile(fileId: string): Promise<LibraryFile | null> {
  const supabase = requireServerClient();

  const { data: row, error } = await supabase
    .from("library_files")
    .select()
    .eq("id", fileId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to get file: ${error.message}`);
  }

  return dbToFile(row as DbLibraryFile);
}

/**
 * Get a signed URL for file download
 */
export async function getFileUrl(
  storagePath: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = requireServerClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to get file URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Get files with signed URLs
 */
export async function getFilesWithUrls(params?: {
  category?: FileCategory;
  sourceType?: FileSourceType;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ files: LibraryFile[]; total: number }> {
  const { files, total } = await getFiles(params);

  // Get signed URLs for all files
  const filesWithUrls = await Promise.all(
    files.map(async (file) => {
      try {
        const url = await getFileUrl(file.storagePath);
        return { ...file, url };
      } catch {
        return file;
      }
    })
  );

  return { files: filesWithUrls, total };
}

/**
 * Delete a file from storage and database
 */
export async function deleteFile(fileId: string): Promise<void> {
  const supabase = requireServerClient();

  // Get the file first to get storage path
  const file = await getFile(fileId);
  if (!file) {
    throw new Error("File not found");
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([file.storagePath]);

  if (storageError) {
    throw new Error(`Failed to delete file from storage: ${storageError.message}`);
  }

  // Delete database record
  const { error: dbError } = await supabase
    .from("library_files")
    .delete()
    .eq("id", fileId);

  if (dbError) {
    throw new Error(`Failed to delete file record: ${dbError.message}`);
  }
}

/**
 * Delete multiple files
 */
export async function deleteFiles(fileIds: string[]): Promise<void> {
  await Promise.all(fileIds.map(deleteFile));
}
