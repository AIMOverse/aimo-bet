"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

interface GenerateSidebarProps {
  search: string;
}

export function GenerateSidebar({ search }: GenerateSidebarProps) {
  // search prop available for future filtering
  void search;
  return (
    <SidebarGroup className="flex-1">
      <SidebarGroupLabel>History</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No generations yet</p>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
