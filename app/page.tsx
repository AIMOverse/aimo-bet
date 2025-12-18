import { redirect } from "next/navigation";

/**
 * Home page - redirects to new chat.
 */
export default function Home() {
  redirect("/chat/new");
}
