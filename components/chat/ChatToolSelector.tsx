"use client";

import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToolStore } from "@/store/toolStore";
import { Globe, ImageIcon, Settings2, VideoIcon } from "lucide-react";

interface ToolToggleItemProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToolToggleItem({
  icon,
  label,
  checked,
  onCheckedChange,
}: ToolToggleItemProps) {
  return (
    <div
      role="menuitem"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
        "hover:bg-accent hover:text-accent-foreground",
        "[&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ToolDisabledItem({
  icon,
  label,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="menuitem"
          className={cn(
            "relative flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none opacity-50",
            "[&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          )}
        >
          {icon}
          <span className="flex-1">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function ChatToolMenuItems() {
  const {
    generateImageEnabled,
    generateVideoEnabled,
    webSearchEnabled,
    setGenerateImageEnabled,
    setGenerateVideoEnabled,
    setWebSearchEnabled,
  } = useToolStore();

  return (
    <>
      <DropdownMenuSeparator />
      <ToolToggleItem
        icon={<ImageIcon />}
        label="Generate Image"
        checked={generateImageEnabled}
        onCheckedChange={setGenerateImageEnabled}
      />
      <ToolToggleItem
        icon={<VideoIcon />}
        label="Generate Video"
        checked={generateVideoEnabled}
        onCheckedChange={setGenerateVideoEnabled}
      />
      <ToolToggleItem
        icon={<Globe />}
        label="Web Search"
        checked={webSearchEnabled}
        onCheckedChange={setWebSearchEnabled}
      />
      <ToolDisabledItem
        icon={<Settings2 />}
        label="More tools"
        tooltip="Coming soon"
      />
    </>
  );
}
