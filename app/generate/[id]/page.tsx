import { Sparkles } from "lucide-react";

interface GenerateSessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function GenerateSessionPage({
  params,
}: GenerateSessionPageProps) {
  const { id } = await params;

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="rounded-full bg-muted p-4">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Generate</h1>
        <p className="text-muted-foreground">
          Content and image generation coming soon.
        </p>
        <p className="text-xs text-muted-foreground/60">Session: {id}</p>
      </div>
    </div>
  );
}
