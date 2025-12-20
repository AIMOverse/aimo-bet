"use client";

import { useAuth } from "@crossmint/client-sdk-react-ui";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { login, status } = useAuth();

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogin}
      disabled={status === "in-progress"}
    >
      {status === "in-progress" ? "Signing in..." : "Sign in"}
    </Button>
  );
}
