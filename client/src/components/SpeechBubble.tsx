import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Pure visual bubble. Announcing it is the parent's job: wrap it in a live region
 * (role="status") that is already mounted before the text arrives.
 */
interface SpeechBubbleProps {
  children: ReactNode
  tail?: "down" | "left" | "up"
  className?: string
}

export default function SpeechBubble({ children, tail = "down", className }: SpeechBubbleProps) {
  return (
    <div
      className={cn(
        "bubble relative mx-0.5 max-w-full bg-card px-2 py-1 font-pixel text-[0.65rem] leading-tight uppercase text-foreground break-words",
        tail === "down" ? "bubble-tail-down mb-1.5" : tail === "up" ? "bubble-tail-up mt-2" : "bubble-tail-left ml-2",
        className,
      )}
    >
      {children}
    </div>
  )
}
