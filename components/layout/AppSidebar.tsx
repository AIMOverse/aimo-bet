"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Store,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { useSessions } from "@/hooks/chat";
import { useSessionStore } from "@/store/sessionStore";
import { useCallback } from "react";

const NAV_ITEMS = [
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/" },
  { id: "store", label: "Store", icon: Store, href: "/store" },
] as const;

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const { sessions, createSession, deleteSession, isLoading } = useSessions();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const handleNewChat = useCallback(async () => {
    const session = await createSession();
    if (session) {
      setCurrentSession(session.id);
      router.push(`/chat/${session.id}`);
      if (isMobile) setOpenMobile(false);
    }
  }, [createSession, setCurrentSession, router, isMobile, setOpenMobile]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setCurrentSession(sessionId);
      router.push(`/chat/${sessionId}`);
      if (isMobile) setOpenMobile(false);
    },
    [setCurrentSession, router, isMobile, setOpenMobile]
  );

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        router.push("/");
      }
    },
    [deleteSession, currentSessionId, router]
  );

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
          <Button variant="ghost" size="icon" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/chat")
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleNavClick(item.href)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sessions */}
        <SidebarGroup className="flex-1">
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-320px)]">
              <SidebarMenu>
                {isLoading ? (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    Loading...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No sessions yet
                  </div>
                ) : (
                  sessions.map((session) => (
                    <SidebarMenuItem key={session.id} className="group">
                      <SidebarMenuButton
                        onClick={() => handleSelectSession(session.id)}
                        isActive={currentSessionId === session.id}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="truncate">{session.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
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
