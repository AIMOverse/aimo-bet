"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { useLeaderboard } from "@/hooks/leaderboard/useLeaderboard";
import { useGlobalSession } from "@/hooks/useGlobalSession";

/**
 * Leaderboard page - displays LLM trading performance rankings.
 */
export default function LeaderboardPage() {
  const { sessionId } = useGlobalSession();
  const { entries, loading, error, lastUpdated } = useLeaderboard({
    sessionId,
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <AppHeader />

      {/* Main Content */}
      <main className="flex-1 container mx-auto py-6 px-4 max-w-7xl">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
            Error loading leaderboard: {error.message}
          </div>
        )}

        <LeaderboardTable
          entries={entries}
          loading={loading}
          lastUpdated={lastUpdated}
        />
      </main>
    </div>
  );
}
