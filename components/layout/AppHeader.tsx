"use client";

import { useAuth } from "@crossmint/client-sdk-react-ui";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AuthButton } from "@/components/account/AuthButton";

export function AppHeader() {
  const { user, status } = useAuth();
  const isLoggedIn = status === "logged-in" && user;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="flex items-center gap-2">
        {!isLoggedIn && <AuthButton />}
      </div>
    </header>
  );
}
