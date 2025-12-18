import { toast } from "sonner"

/**
 * Unified feedback layer for user notifications.
 * Uses sonner toast under the hood.
 */
export const feedback = {
  /**
   * Show a success message
   */
  success: (message: string) => toast.success(message),

  /**
   * Show an error message. Optionally logs the error to console.
   */
  error: (message: string, err?: unknown) => {
    if (err) console.error(err)
    toast.error(message)
  },

  /**
   * Show an informational message
   */
  info: (message: string) => toast.info(message),
}
