"use client";

import { useRouter } from "next/navigation";
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
import { Plus, Search, FolderOpen } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { AccountPopover } from "@/components/account/AccountPopover";
import { useCallback, useState } from "react";

export function AppSidebar() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const requestNewChat = useChatStore((s) => s.requestNewChat);

  // Search state
  const [search, setSearch] = useState("");

  // Navigate to new chat
  const handleNewChat = useCallback(() => {
    requestNewChat(); // Increments counter to force fresh chat state
    router.push("/chat");
    if (isMobile) setOpenMobile(false);
  }, [requestNewChat, router, isMobile, setOpenMobile]);

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        {/* Title */}
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="font-semibold text-lg">AiMo Chat</span>
        </div>

        {/* Search */}
        <div className="px-2 py-2">
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
      </SidebarHeader>

      <SidebarContent>
        {/* Quick Actions */}
        <SidebarMenu className="px-2 pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push("/library")}>
              <FolderOpen className="h-4 w-4" />
              <span>Library</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Chat history sidebar */}
        <ChatSidebar search={search} />
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <AccountPopover />
      </SidebarFooter>
    </Sidebar>
  );
}
