"use client";

import { useState, useEffect } from "react";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TopUpModal } from "./TopUpModal";
import { ThemeToggle } from "@/components/layout/ThemeProvider";
import {
  User,
  LogIn,
  LogOut,
  CreditCard,
  Settings,
  Copy,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Separator } from "../ui/separator";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemMedia,
} from "@/components/ui/item";

export function AccountPopover() {
  const { user, status, login, logout } = useAuth();
  const { wallet } = useWallet();
  const router = useRouter();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isLoggedIn = status === "logged-in" && user;

  // Fetch USDC balance when wallet is available
  useEffect(() => {
    async function fetchBalance() {
      if (!wallet) {
        setUsdcBalance(null);
        return;
      }

      try {
        const { usdc } = await wallet.balances(["usdc"]);
        if (usdc) {
          setUsdcBalance(usdc.amount);
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setUsdcBalance(null);
      }
    }

    fetchBalance();
  }, [wallet]);

  const handleLogin = async () => {
    setPopoverOpen(false);
    try {
      await login();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    setPopoverOpen(false);
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleSettings = () => {
    setPopoverOpen(false);
    router.push("/settings");
  };

  const handleTopUp = () => {
    setPopoverOpen(false);
    setTopUpOpen(true);
  };

  const handleCopyAddress = async () => {
    if (!wallet?.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  // Truncate wallet address: 0x1234...abcd
  const truncateAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get display name from user email or wallet
  const displayName = isLoggedIn
    ? user.email?.split("@")[0] || "User"
    : "Guest";

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-2 py-6"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start text-sm">
              <span className="font-medium">{displayName}</span>
              {isLoggedIn && (
                <span className="text-xs text-muted-foreground">
                  Balance: {usdcBalance !== null ? `$${usdcBalance}` : "--"}
                </span>
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="flex flex-col gap-1">
            {isLoggedIn && (
              <>
                <Item size="sm">
                  <ItemMedia variant="icon">
                    <User className="h-4 w-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{displayName}</ItemTitle>
                    {wallet?.address && (
                      <ItemDescription className="font-mono">
                        {truncateAddress(wallet.address)}
                      </ItemDescription>
                    )}
                  </ItemContent>
                  {wallet?.address && (
                    <ItemActions>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleCopyAddress}
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </ItemActions>
                  )}
                </Item>

                <Separator />

                <Item size="sm">
                  <ItemMedia variant="icon">
                    <CreditCard className="h-4 w-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Balance</ItemTitle>
                    <ItemDescription>
                      {usdcBalance !== null ? `$${usdcBalance} USDC` : "--"}
                    </ItemDescription>
                  </ItemContent>
                  {isLoggedIn && (
                    <ItemActions>
                      <Button variant="outline" size="sm" onClick={handleTopUp}>
                        Top up
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              </>
            )}

            {isLoggedIn ? (
              <>
                {/* Settings - logged in only */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={handleSettings}
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Button>

                {/* Theme toggle - always visible */}
                <ThemeToggle />

                {/* Logout - logged in only */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </Button>
              </>
            ) : (
              <>
                {/* Theme toggle - always visible */}
                <ThemeToggle />

                {/* Login - guest only */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={handleLogin}
                >
                  <LogIn className="h-4 w-4" />
                  <span>Sign in</span>
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} />
    </>
  );
}
