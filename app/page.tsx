import { redirect } from "next/navigation";

/**
 * Home page - always redirects to chat.
 * Users can chat as guests or sign in from the chat interface.
 */
export default function Home() {
  redirect("/chat");
}
