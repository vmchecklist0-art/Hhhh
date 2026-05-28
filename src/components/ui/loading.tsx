import { Loader2Icon } from "lucide-react"

type LoadingStateProps = {
  message?: string
  description?: string
  className?: string
}

export function LoadingState({ message = "Loading", description, className }: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className ?? ""}`}>
      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground animate-pulse">{message}</p>
        {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
      </div>
    </div>
  )
}
