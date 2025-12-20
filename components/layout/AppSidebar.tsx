"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { GenerateSidebar } from "@/components/generate/GenerateSidebar";
import { AccountPopover } from "@/components/account/AccountPopover";
import { useCallback, useState } from "react";

type AppMode = "chat" | "generate";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const setCurrentSession = useChatStore((s) => s.setCurrentSession);

  // Search state (shared across modes)
  const [search, setSearch] = useState("");

  // Derive active mode from URL
  const activeMode: AppMode = pathname.startsWith("/generate")
    ? "generate"
    : "chat";

  const handleModeChange = useCallback(
    (mode: string) => {
      router.push(`/${mode}`);
      if (isMobile) setOpenMobile(false);
    },
    [router, isMobile, setOpenMobile],
  );

  // Navigate to appropriate route for new session
  const handleNew = useCallback(() => {
    if (activeMode === "chat") {
      setCurrentSession(null);
      router.push("/chat");
    } else {
      router.push("/generate");
    }
    if (isMobile) setOpenMobile(false);
  }, [activeMode, setCurrentSession, router, isMobile, setOpenMobile]);

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        {/* Title */}
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="font-semibold text-lg">AiMo Chat</span>
        </div>

        {/* Search */}
        <div className="px-2 pt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="px-2 py-2">
          <Tabs value={activeMode} onValueChange={handleModeChange}>
            <TabsList className="w-full">
              <TabsTrigger value="chat" className="flex-1">
                Chat
              </TabsTrigger>
              <TabsTrigger value="generate" className="flex-1" disabled>
                Generate
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Quick Actions */}
        <SidebarMenu className="px-2 pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleNew}>
              <Plus className="h-4 w-4" />
              <span>
                {activeMode === "chat" ? "New Chat" : "New Generation"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Mode-specific sidebar content */}
        {activeMode === "chat" ? (
          <ChatSidebar search={search} />
        ) : (
          <GenerateSidebar search={search} />
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <AccountPopover />
      </SidebarFooter>
    </Sidebar>
  );
}
