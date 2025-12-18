"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";
import { useSessions } from "@/hooks/chat";
import { useSessionStore } from "@/store/sessionStore";
import { formatRelativeTime } from "@/lib/utils";
import { RenameSessionDialog } from "./RenameSessionDialog";

export function ChatSidebar() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const { sessions, deleteSession, updateSession, isLoading } = useSessions();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const [search, setSearch] = useState("");
  const [renameSession, setRenameSession] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const query = search.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(query));
  }, [sessions, search]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setCurrentSession(sessionId);
      router.push(`/chat/${sessionId}`);
      if (isMobile) setOpenMobile(false);
    },
    [setCurrentSession, router, isMobile, setOpenMobile]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setOpenPopoverId(null);
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        router.push("/");
      }
    },
    [deleteSession, currentSessionId, router]
  );

  const handleRenameClick = useCallback(
    (session: { id: string; title: string }) => {
      setOpenPopoverId(null);
      setRenameSession(session);
    },
    []
  );

  const handleRenameSubmit = useCallback(
    async (newTitle: string) => {
      if (renameSession) {
        await updateSession(renameSession.id, { title: newTitle });
        setRenameSession(null);
      }
    },
    [renameSession, updateSession]
  );

  return (
    <>
      <SidebarGroup className="flex-1">
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
          {/* Search Input */}
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Session List */}
          <ScrollArea className="h-[calc(100vh-320px)]">
            <SidebarMenu>
              {isLoading ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  Loading...
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  {search ? "No matching sessions" : "No conversations yet."}
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <SidebarMenuItem key={session.id} className="group relative">
                    <SidebarMenuButton
                      onClick={() => handleSelectSession(session.id)}
                      isActive={currentSessionId === session.id}
                      className="pr-8"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{session.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(
                            session.updatedAt || session.createdAt
                          )}
                        </span>
                      </div>
                    </SidebarMenuButton>

                    {/* Popover Menu */}
                    <Popover
                      open={openPopoverId === session.id}
                      onOpenChange={(open) =>
                        setOpenPopoverId(open ? session.id : null)
                      }
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1" align="end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() =>
                            handleRenameClick({
                              id: session.id,
                              title: session.title,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-destructive hover:text-destructive"
                          onClick={() => handleDeleteSession(session.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </PopoverContent>
                    </Popover>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Dialog */}
      <RenameSessionDialog
        open={!!renameSession}
        onOpenChange={(open) => !open && setRenameSession(null)}
        currentTitle={renameSession?.title || ""}
        onSubmit={handleRenameSubmit}
      />
    </>
  );
}
