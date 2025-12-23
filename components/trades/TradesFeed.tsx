"use client";

import { ArrowRightLeft, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TradeCard } from "./TradeCard";
import type { TradeWithModel } from "@/types/arena";
import { useArenaStore } from "@/store/arenaStore";
import { DEFAULT_ARENA_MODELS } from "@/lib/arena/constants";
import { useMemo } from "react";

interface TradesFeedProps {
  trades: TradeWithModel[];
}

export function TradesFeed({ trades }: TradesFeedProps) {
  const { tradeFilter, setTradeFilter, clearTradeFilter, selectedModelId } =
    useArenaStore();

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      if (selectedModelId && trade.model.id !== selectedModelId) {
        return false;
      }
      if (tradeFilter.action && trade.action !== tradeFilter.action) {
        return false;
      }
      if (tradeFilter.side && trade.side !== tradeFilter.side) {
        return false;
      }
      return true;
    });
  }, [trades, selectedModelId, tradeFilter]);

  const hasFilters =
    selectedModelId || tradeFilter.action || tradeFilter.side;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowRightLeft className="h-5 w-5" />
          Recent Trades
        </CardTitle>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={hasFilters ? "secondary" : "ghost"}
              size="sm"
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Filter by Action</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => setTradeFilter({ action: "buy" })}
            >
              Buy only
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTradeFilter({ action: "sell" })}
            >
              Sell only
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Filter by Side</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setTradeFilter({ side: "yes" })}>
              YES positions
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTradeFilter({ side: "no" })}>
              NO positions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hasFilters && (
              <DropdownMenuItem onClick={clearTradeFilter}>
                Clear filters
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {filteredTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ArrowRightLeft className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No trades yet</p>
              <p className="text-sm text-muted-foreground/70">
                Trades will appear here once models start trading
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrades.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
