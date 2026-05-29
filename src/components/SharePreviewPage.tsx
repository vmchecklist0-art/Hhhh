import { useEffect } from "react"
import { Loader as Loader2 } from "lucide-react"

interface SharePreviewPageProps {
  slug: string
  onEnter: (longUrl: string) => void
  onError: () => void
}

export function SharePreviewPage({ slug, onEnter, onError }: SharePreviewPageProps) {
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
      .catch(() => onError())
  }, [slug, onEnter, onError])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-7 animate-spin" />
        <p className="text-[13px] font-medium">Loading…</p>
      </div>
    </div>
  )
}
