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
import { Plus, Store, Settings } from "lucide-react";
import { useSessions } from "@/hooks/chat";
import { useSessionStore } from "@/store/sessionStore";
import { ChatSidebar } from "./ChatSidebar";
import { useCallback } from "react";

export function AppSidebar() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const { createSession } = useSessions();
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const handleNewChat = useCallback(async () => {
    const session = await createSession();
    if (session) {
      setCurrentSession(session.id);
      router.push(`/chat/${session.id}`);
      if (isMobile) setOpenMobile(false);
    }
  }, [createSession, setCurrentSession, router, isMobile, setOpenMobile]);

  const handleNavClick = useCallback(
    (href: string) => {
      router.push(href);
      if (isMobile) setOpenMobile(false);
    },
    [router, isMobile, setOpenMobile]
  );

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2 py-2">
          <span className="font-semibold text-lg">AiMo Chat</span>
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
            <SidebarMenuButton onClick={() => handleNavClick("/store")}>
              <Store className="h-4 w-4" />
              <span>Browse Store</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Chat History (delegated to ChatSidebar) */}
        <ChatSidebar />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => handleNavClick("/settings")}>
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
