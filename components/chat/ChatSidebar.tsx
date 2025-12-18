"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
import { useSessions } from "@/hooks/chat";
import { useSessionStore } from "@/store/sessionStore";

interface RenameSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onSubmit: (newTitle: string) => Promise<void>;
}

function RenameSessionDialog({
  open,
  onOpenChange,
  currentTitle,
  onSubmit,
}: RenameSessionDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
    }
  }, [open, currentTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title === currentTitle) {
      onOpenChange(false);
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(title.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Enter a new name for this chat session.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter session title..."
              aria-label="Session title"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const query = search.toLowerCase();
    return sessions.filter((s) => s.title?.toLowerCase().includes(query));
  }, [sessions, search]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setCurrentSession(sessionId);
      router.push(`/chat/${sessionId}`);
      if (isMobile) setOpenMobile(false);
    },
    [setCurrentSession, router, isMobile, setOpenMobile],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setOpenPopoverId(null);
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        router.push("/");
      }
    },
    [deleteSession, currentSessionId, router],
  );

  const handleRenameClick = useCallback(
    (session: { id: string; title: string }) => {
      setOpenPopoverId(null);
      setRenameSession(session);
    },
    [],
  );

  const handleRenameSubmit = useCallback(
    async (newTitle: string) => {
      if (renameSession) {
        await updateSession(renameSession.id, { title: newTitle });
        setRenameSession(null);
      }
    },
    [renameSession, updateSession],
  );

  return (
    <>
      <SidebarGroup className="flex-1">
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
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

          <ScrollArea className="h-[calc(100vh-320px)]">
            <SidebarMenu>
              {isLoading ? (
                <SidebarMenuItem key="loading">
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    Loading...
                  </div>
                </SidebarMenuItem>
              ) : filteredSessions.length === 0 ? (
                <SidebarMenuItem key="empty">
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    {search ? "No matching sessions" : "No conversations yet."}
                  </div>
                </SidebarMenuItem>
              ) : (
                filteredSessions.map((session) => (
                  <SidebarMenuItem key={session.id} className="group relative">
                    <SidebarMenuButton
                      onClick={() => handleSelectSession(session.id)}
                      isActive={currentSessionId === session.id}
                      className="pr-8"
                    >
                      <span className="truncate">
                        {session.title || "Untitled"}
                      </span>
                    </SidebarMenuButton>

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

      <RenameSessionDialog
        open={!!renameSession}
        onOpenChange={(open) => !open && setRenameSession(null)}
        currentTitle={renameSession?.title || ""}
        onSubmit={handleRenameSubmit}
      />
    </>
  );
}
