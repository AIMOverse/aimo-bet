import { Sparkles } from "lucide-react";

export default function GeneratePage() {
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
      </div>
    </div>
  );
}
