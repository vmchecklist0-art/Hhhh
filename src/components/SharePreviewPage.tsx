import { useEffect, useState } from "react"
import { Loader as Loader2, CircleAlert as AlertCircle } from "lucide-react"

interface SharePreviewPageProps {
  slug: string
  onEnter: (longUrl: string) => void
}

export function SharePreviewPage({ slug, onEnter }: SharePreviewPageProps) {
  const [error, setError] = useState(false)

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

    fetch(`${supabaseUrl}/functions/v1/short-link?slug=${encodeURIComponent(slug)}`, {
      headers: { "Authorization": `Bearer ${supabaseKey}` },
      signal: AbortSignal.timeout(10000),
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Not found")))
      .then((json: { longUrl?: string }) => {
        if (!json.longUrl) throw new Error("Invalid response")
        onEnter(json.longUrl)
      })
      .catch(() => setError(true))
  }, [slug, onEnter])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-destructive/5 p-8 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="size-8 text-destructive/60" />
          <p className="text-[15px] font-semibold text-foreground">Link not found</p>
          <p className="text-[12px] text-muted-foreground">This link may have expired or is invalid.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-7 animate-spin" />
        <p className="text-[13px] font-medium">Loading…</p>
      </div>
    </div>
  )
}
