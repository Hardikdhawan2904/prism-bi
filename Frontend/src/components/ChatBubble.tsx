import type { ReactNode } from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatBubble({
  role,
  children,
  tone = "default",
  plain = false,
}: {
  role: "user" | "assistant";
  children: ReactNode;
  tone?: "default" | "destructive";
  /** Assistant only: no bubble background — for content that brings its own cards. */
  plain?: boolean;
}) {
  const isUser = role === "user";

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "text-sm",
          isUser ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground" : "min-w-0 flex-1",
          !isUser && !plain && "rounded-2xl rounded-tl-sm px-4 py-3",
          !isUser && !plain && tone === "default" && "bg-muted text-foreground",
          !isUser && !plain && tone === "destructive" && "bg-destructive/10 text-destructive"
        )}
      >
        {children}
      </div>
    </div>
  );
}
