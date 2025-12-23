import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <SidebarTrigger className="-ml-1" />
    </header>
  );
}
