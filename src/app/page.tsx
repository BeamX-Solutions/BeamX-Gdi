import { Chat } from "@/components/workspace/chat";

/**
 * A new chat (spec 0007, AC-1). Fully static: the client reads the session itself, and
 * nothing is created until the first send.
 */
export default function Home() {
  return <Chat />;
}
