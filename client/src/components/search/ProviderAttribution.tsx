import type { ReactNode } from "react"

export interface ProviderAttributionProps {
  href: string
  children: ReactNode
}

export function ProviderAttribution({ href, children }: ProviderAttributionProps) {
  return (
    <p className="text-xs text-muted-foreground">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-link underline-offset-4 hover:underline"
      >
        {children}
      </a>
    </p>
  )
}
