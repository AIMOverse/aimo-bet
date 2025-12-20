import { NextResponse } from "next/server";
import {
  getFilesWithUrls,
  uploadFile,
  deleteFile,
  deleteFiles,
} from "@/lib/supabase/files";
import type { FileCategory, FileSourceType } from "@/lib/supabase/types";

// ============================================================================
// GET /api/library - List files with optional filters
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") as FileCategory | null;
    const sourceType = searchParams.get("sourceType") as FileSourceType | null;
    const search = searchParams.get("search");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    const result = await getFilesWithUrls({
      category: category ?? undefined,
      sourceType: sourceType ?? undefined,
      search: search ?? undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get files:", error);
    return NextResponse.json(
      { error: "Failed to get files" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/library - Upload a file
// ============================================================================

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceType = (formData.get("sourceType") as FileSourceType) || "uploaded";
    const sourceId = formData.get("sourceId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const libraryFile = await uploadFile({
      file: buffer,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sourceType,
      sourceId,
    });

    return NextResponse.json(libraryFile, { status: 201 });
  } catch (error) {
    console.error("Failed to upload file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/library - Delete file(s)
// ============================================================================

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("id");
    const fileIds = searchParams.get("ids");

    if (fileIds) {
      // Delete multiple files
      const ids = fileIds.split(",").filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "At least one file ID is required" },
          { status: 400 }
        );
      }
      await deleteFiles(ids);
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    if (fileId) {
      // Delete single file
      await deleteFile(fileId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "File ID is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to delete file:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
