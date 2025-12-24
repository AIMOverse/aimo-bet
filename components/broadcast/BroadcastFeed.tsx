"use client";

import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BroadcastCard } from "./BroadcastCard";
import type { BroadcastWithModel } from "@/types/arena";

interface BroadcastFeedProps {
  broadcasts: BroadcastWithModel[];
  selectedModelId: string | null;
}

export function BroadcastFeed({
  broadcasts,
  selectedModelId,
}: BroadcastFeedProps) {
  // Filter broadcasts by selected model
  const filteredBroadcasts = useMemo(() => {
    if (!selectedModelId) return broadcasts;
    return broadcasts.filter((b) => b.model.id === selectedModelId);
  }, [broadcasts, selectedModelId]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Model Chat
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {filteredBroadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No broadcasts yet</p>
              <p className="text-sm text-muted-foreground/70">
                Model analysis and commentary will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBroadcasts.map((broadcast) => (
                <BroadcastCard key={broadcast.id} broadcast={broadcast} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
