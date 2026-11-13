import type { ReactNode } from "react"

import BlueDude from "@/components/BlueDude"
import SpeechBubble from "@/components/SpeechBubble"

interface EmptyStateProps {
  line: string
  children?: ReactNode
  size?: 32 | 48 | 64 | 96
}

export default function EmptyState({ line, children, size = 64 }: EmptyStateProps) {
  return (
    <div className="m-4 flex flex-col items-center gap-1 text-center text-muted-foreground">
      <div className="max-w-xs">
        <SpeechBubble>{line}</SpeechBubble>
      </div>
      <BlueDude size={size} mood="lookDown" />
      {children}
    </div>
  )
}
