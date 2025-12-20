import { NextResponse } from "next/server";
import { getFile, getFileUrl, deleteFile } from "@/lib/supabase/files";

// ============================================================================
// GET /api/library/[id] - Get file details with download URL
// ============================================================================

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const file = await getFile(id);
    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Get signed URL for download
    const url = await getFileUrl(file.storagePath);

    return NextResponse.json({ ...file, url });
  } catch (error) {
    console.error("Failed to get file:", error);
    return NextResponse.json(
      { error: "Failed to get file" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/library/[id] - Delete a file
// ============================================================================

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await deleteFile(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete file:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
