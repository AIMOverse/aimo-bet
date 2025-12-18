"use client";

import { useEffect } from "react";
import { feedback } from "@/lib/feedback/feedback";

/**
 * Hook that shows an error toast when the user goes offline.
 * Shows a success toast when they come back online.
 */
export function useIsOffline(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOffline = () => {
      feedback.error(
        "You're offline. Connect to the internet to send messages.",
      );
    };

    const handleOnline = () => {
      feedback.success("You're back online.");
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);
}
