import { useEffect, useState } from "react"
import { Loader as Loader2, MapPin, Table2, Navigation2, ListFilter as Filter, Search, Info, Eye, CircleAlert as AlertCircle } from "lucide-react"

interface ViewState {
  s: string
  r: string[]
  d: string[]
  sk: string
  sd: string
  vc: string[]
  ro?: 1
  pts?: string[]
  ctitle?: string
}

function decodeViewState(encoded: string): ViewState | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as ViewState
  } catch {
    return null
  }
}

interface SharePreviewPageProps {
  slug: string
  onEnter: (longUrl: string) => void
}

export function SharePreviewPage({ slug, onEnter }: SharePreviewPageProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [longUrl, setLongUrl] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState | null>(null)

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
        setLongUrl(json.longUrl)

        // Parse the encoded view state from the long URL hash
        const hashIndex = json.longUrl.indexOf("#loc=")
        if (hashIndex !== -1) {
          const encoded = json.longUrl.slice(hashIndex + 5)
          setViewState(decodeViewState(encoded))
        }
        setStatus("ready")
      })
      .catch(() => setStatus("error"))
  }, [slug])

  const handleEnter = () => {
    if (longUrl) onEnter(longUrl)
  }

  const isCustom = !!viewState?.pts?.length
  const title = viewState?.ctitle ?? (isCustom ? "Custom Table" : "Location View")
  const ptCount = viewState?.pts?.length ?? null
  const routeFilters = viewState?.r ?? []
  const deliveryFilters = viewState?.d ?? []
  const searchVal = viewState?.s ?? ""

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-400">

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-7 animate-spin" />
            <p className="text-[13px] font-medium">Loading preview…</p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="size-8 text-destructive/60" />
            <p className="text-[15px] font-semibold text-foreground">Link not found</p>
            <p className="text-[12px] text-muted-foreground">This link may have expired or is invalid.</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="rounded-2xl border border-border/60 bg-card shadow-lg overflow-hidden">
              {/* Header band */}
              <div className="bg-primary/8 border-b border-primary/15 px-5 py-4 flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 shrink-0">
                  {isCustom
                    ? <Table2 className="size-4 text-primary" />
                    : <MapPin className="size-4 text-primary" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/60 mb-0.5">
                    {isCustom ? "Custom Table" : "Shared View"}
                  </p>
                  <p className="text-[15px] font-bold text-foreground truncate">{title}</p>
                </div>
              </div>

              {/* Meta details */}
              <div className="px-5 py-4 space-y-2.5">
                {ptCount !== null && (
                  <div className="flex items-center gap-2.5">
                    <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] text-foreground font-medium">
                      {ptCount} location{ptCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {routeFilters.length > 0 && (
                  <div className="flex items-center gap-2.5">
                    <Navigation2 className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] text-foreground font-medium">
                      {routeFilters.length} route filter{routeFilters.length !== 1 ? "s" : ""} active
                    </span>
                  </div>
                )}
                {deliveryFilters.length > 0 && (
                  <div className="flex items-center gap-2.5">
                    <Filter className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] text-foreground font-medium">
                      {deliveryFilters.length} delivery filter{deliveryFilters.length !== 1 ? "s" : ""} active
                    </span>
                  </div>
                )}
                {searchVal && (
                  <div className="flex items-center gap-2.5">
                    <Search className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] text-foreground font-medium">
                      Search: <span className="font-semibold text-primary">"{searchVal}"</span>
                    </span>
                  </div>
                )}
                {!ptCount && !routeFilters.length && !deliveryFilters.length && !searchVal && (
                  <p className="text-[12px] text-muted-foreground">All locations, no filters applied.</p>
                )}
              </div>

              {/* Read-only notice */}
              <div className="mx-4 mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 px-3 py-2 flex items-center gap-2">
                <Info className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Read-only shared view</p>
              </div>

              {/* CTA */}
              <div className="px-4 pb-4">
                <button
                  onClick={handleEnter}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-sm"
                >
                  <Eye className="size-4" />
                  View Table
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground/40 mt-4">
              Shared via FamilyMart Location · /s/{slug}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
