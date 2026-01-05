"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "../ui/badge";
import { useTheme } from "next-themes";
import Link from "next/link";

export function AppHeader() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-background">
      {/* Left: Title + Status */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">AImoBET</h1>
        <Badge variant="secondary">Season 0</Badge>
      </div>

      {/* Right: Links + Theme toggle */}
      <div className="flex items-center gap-3">
        <Link
          href="https://aimo.network"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          About AiMo Network
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
}
