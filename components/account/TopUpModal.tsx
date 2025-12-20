"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopUpModal({ open, onOpenChange }: TopUpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Top Up Credits</DialogTitle>
          <DialogDescription>
            Add credits to your account to continue using AI services.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          Coming soon
        </div>
      </DialogContent>
    </Dialog>
  );
}
