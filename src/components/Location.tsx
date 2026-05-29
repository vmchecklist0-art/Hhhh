import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Link, Loader as Loader2, CircleAlert as AlertCircle, TriangleAlert as AlertTriangle, Search, X, ChevronUp, ChevronDown as ChevronDownIcon, ChevronsUpDown, ListFilter as Filter, Check, Columns2, Info, Copy, Trash2, ExternalLink, Bookmark, Pencil, CheckCheck, Navigation2, LayoutList } from "lucide-react"
import { toast } from "sonner"
import { cn, parseSmartQuery, isDeliveryActive } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RowInfoModal } from "@/components/RowInfoModal"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEditMode } from "@/contexts/EditModeContext"
import { useRoadDistances } from "@/hooks/use-road-distances"
import { useRegisterRefresh } from "@/contexts/RefreshContext"

// ─── Example: Using .env variables ─────────────────────────────────────────────
// Access environment variables like this:
// const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
// Example: const mapsUrl = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}`
// Make sure to add VITE_ prefix for client-side variables in .env file

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeliveryPoint {
  code: string
  name: string
  delivery: "Daily" | "Weekday" | "Alt 1" | "Alt 2" | string
  latitude: number
  longitude: number
  descriptions: { key: string; value: string }[]
  qrCodeImageUrl?: string
  qrCodeDestinationUrl?: string
}

interface Route {
  id: string
  name: string
  code: string
  shift: string
  deliveryPoints: DeliveryPoint[]
}

interface FlatPoint extends DeliveryPoint {
  routeId: string
  routeName: string
  routeCode: string
  routeShift: string
  _rowIndex: number
  _dupCode: boolean
  _dupName: boolean
}

type SortKey = "code" | "name" | "delivery" | "route"
type SortDir = "asc" | "desc"

interface SavedRowOrder {
  id: string
  label: string
  order: string[]  // array of point.code in order
}

const DEFAULT_MAP_CENTER = { lat: 3.06955, lng: 101.5469179 }

function formatKm(km: number): string {
  const rounded = Math.round(km * 10) / 10
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} Km`
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

// ─── Route optimisation helpers ───────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestNeighborSort(points: FlatPoint[], start = DEFAULT_MAP_CENTER): FlatPoint[] {
  const withCoords = points.filter(p => p.latitude !== 0 || p.longitude !== 0)
  const noCoords   = points.filter(p => p.latitude === 0 && p.longitude === 0)
  if (withCoords.length === 0) return points
  const unvisited = [...withCoords]
  const result: FlatPoint[] = []
  let curLat = start.lat, curLng = start.lng
  while (unvisited.length > 0) {
    let minDist = Infinity, minIdx = 0
    unvisited.forEach((p, i) => {
      const d = haversineKm(curLat, curLng, p.latitude, p.longitude)
      if (d < minDist) { minDist = d; minIdx = i }
    })
    const nearest = unvisited.splice(minIdx, 1)[0]
    result.push(nearest)
    curLat = nearest.latitude
    curLng = nearest.longitude
  }
  return [...result, ...noCoords]
}

// ─── Column definitions ───────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: "no",       label: "#",             description: "Row number" },
  { key: "route",    label: "Route",         description: "Route name" },
  { key: "code",     label: "Code",          description: "Location code" },
  { key: "name",     label: "Name",          description: "Delivery point name" },
  { key: "delivery", label: "Delivery",      description: "Delivery schedule" },
  { key: "km",       label: "KM",            description: "Distance from start point" },
  { key: "action",   label: "Action",        description: "Open row information" },
] as const
type ColumnKey = typeof ALL_COLUMNS[number]["key"]

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ["no", "code", "name", "delivery", "action"]

// ─── Delivery option definitions ─────────────────────────────────────────────
interface DeliveryItem {
  value: string
  label: string
  description: string
  color: string   // Tailwind bg class for the badge
  textColor: string
}

const DELIVERY_ITEMS: DeliveryItem[] = [
  {
    value: "Daily",
    label: "Daily",
    description: "Delivery every day",
    color: "bg-emerald-100 dark:bg-emerald-900/40",
    textColor: "text-emerald-700 dark:text-emerald-300",
  },
  {
    value: "Alt 1",
    label: "Alt 1",
    description: "Delivery on odd dates (1, 3, 5…)",
    color: "bg-violet-100 dark:bg-violet-900/40",
    textColor: "text-violet-700 dark:text-violet-300",
  },
  {
    value: "Alt 2",
    label: "Alt 2",
    description: "Delivery on even dates (2, 4, 6…)",
    color: "bg-fuchsia-100 dark:bg-fuchsia-900/40",
    textColor: "text-fuchsia-700 dark:text-fuchsia-300",
  },
  {
    value: "Weekday",
    label: "WD",
    description: "Sun – Thu",
    color: "bg-sky-100 dark:bg-sky-900/40",
    textColor: "text-sky-700 dark:text-sky-300",
  },
  {
    value: "Weekday 2",
    label: "WE",
    description: "Mon – Fri",
    color: "bg-blue-100 dark:bg-blue-900/40",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  {
    value: "Weekday 3",
    label: "WA",
    description: "Sun, Tue & Thu only",
    color: "bg-indigo-100 dark:bg-indigo-900/40",
    textColor: "text-indigo-700 dark:text-indigo-300",
  },
]

const DELIVERY_MAP = new Map(DELIVERY_ITEMS.map(d => [d.value, d]))

// ─── Share-link helpers ───────────────────────────────────────────────────────
interface ViewState {
  s: string
  r: string[]
  d: string[]
  sk: SortKey
  sd: SortDir
  vc: ColumnKey[]
  ro?: 1        // read-only shared view flag
  pts?: string[]  // custom selected point codes
  ctitle?: string // custom table title
}

function encodeViewState(state: ViewState): string {
  return btoa(encodeURIComponent(JSON.stringify(state)))
}

function readHashState(): ViewState | null {
  try {
    const hash = window.location.hash
    if (!hash.startsWith("#loc=")) return null
    return JSON.parse(decodeURIComponent(atob(hash.slice(5)))) as ViewState
  } catch {
    return null
  }
}

function readHashStateFromUrl(url: string): ViewState | null {
  try {
    const hashIndex = url.indexOf("#loc=")
    if (hashIndex === -1) return null
    return JSON.parse(decodeURIComponent(atob(url.slice(hashIndex + 5)))) as ViewState
  } catch {
    return null
  }
}

// ─── Saved Links ──────────────────────────────────────────────────────────────
interface SavedLink {
  id: string
  label: string
  longUrl: string
  shortUrl: string
  createdAt: string
  type: "custom" | "share"
}

const LINKS_KEY = "ddata_saved_links"
const loadSavedLinks = (): SavedLink[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "[]")
    if (!Array.isArray(stored)) return []
    return stored.map((item: any) => {
      const type = item.type === "custom" || item.type === "share"
        ? item.type
        : readHashStateFromUrl(item.longUrl)?.pts?.length
          ? "custom"
          : "share"
      return {
        id: item.id ?? crypto.randomUUID(),
        label: item.label ?? "Saved link",
        longUrl: item.longUrl ?? "",
        shortUrl: item.shortUrl ?? item.longUrl ?? "",
        createdAt: item.createdAt ?? new Date().toISOString(),
        type,
      }
    })
  } catch {
    return []
  }
}
const persistLinks = (links: SavedLink[]) => {
  localStorage.setItem(LINKS_KEY, JSON.stringify(links))
}

const shortenUrl = async (longUrl: string): Promise<string> => {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const res = await fetch(`${supabaseUrl}/functions/v1/short-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ longUrl }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const json = await res.json() as { shortUrl?: string }
      if (json.shortUrl && json.shortUrl.startsWith("http")) return json.shortUrl
    }
  } catch {
    // fall through to original URL
  }
  return longUrl
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DeliveryTableDialog() {
  const { registerSaveHandler, setHasUnsavedChanges } = useEditMode()
  const [routes, setRoutes]   = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [activeActionPoint, setActiveActionPoint] = useState<FlatPoint | null>(null)

  // Pending edits: key = `${routeId}::${rowIndex}`, value = new delivery string
  const [pendingEdits, setPendingEdits] = useState<Map<string, string>>(new Map())
  const [isSaving, setIsSaving]         = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)

  // Read shared-link state once on mount (before useState calls)
  const initHash = useRef(readHashState())
  // True when page was opened via a generated share link (read-only view)
  const isSharedView = initHash.current?.ro === 1

  // Search & Filter — initialised from shared link if present
  const [search, setSearch]                     = useState(initHash.current?.s ?? "")
  const [filterRoutes, setFilterRoutes]         = useState<Set<string>>(new Set(initHash.current?.r ?? []))
  const [filterDeliveries, setFilterDeliveries] = useState<Set<string>>(new Set(initHash.current?.d ?? []))
  const [filterOpen, setFilterOpen]             = useState(false)
  const [draftFilterRoutes, setDraftFilterRoutes] = useState<Set<string>>(new Set(initHash.current?.r ?? []))
  const [draftFilterDeliveries, setDraftFilterDeliveries] = useState<Set<string>>(new Set(initHash.current?.d ?? []))
  const [settingsOpen, setSettingsOpen]         = useState(false)
  const [filterTab, setFilterTab]               = useState<"routes" | "delivery" | "columns">("routes")
  const [sortOpen, setSortOpen]                 = useState(false)
  const [isOptimized, setIsOptimized]           = useState(false)
  const [linksTab, setLinksTab]                 = useState<"custom" | "share" | "saved">("custom")
  const [selectedCodes, setSelectedCodes]       = useState<Set<string>>(new Set())
  const [customTableTitle, setCustomTableTitle] = useState("")
  const [ctGenerating, setCtGenerating]         = useState(false)
  const [ctGeneratedLink, setCtGeneratedLink]   = useState<string | null>(null)
  const [shareGeneratedLink, setShareGeneratedLink] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns]     = useState<Set<ColumnKey>>(
    initHash.current?.vc ? new Set(initHash.current.vc) : new Set(DEFAULT_VISIBLE_COLUMNS)
  )
  const [draftVisibleColumns, setDraftVisibleColumns] = useState<Set<ColumnKey>>(
    initHash.current?.vc ? new Set(initHash.current.vc) : new Set(DEFAULT_VISIBLE_COLUMNS)
  )

  // Clear hash from URL once state is applied (keep URL clean)
  useEffect(() => {
    if (window.location.hash.startsWith("#loc=")) {
      history.replaceState(null, "", window.location.pathname + window.location.search)
    }
  }, [])

  const toggleColumn = (key: ColumnKey, scope: "live" | "draft" = "live") => {
    const updateColumns = scope === "draft" ? setDraftVisibleColumns : setVisibleColumns
    updateColumns(prev => {
      if (prev.size === 1 && prev.has(key)) return prev // keep at least one
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const hiddenColCount = ALL_COLUMNS.length - visibleColumns.size
  const draftHiddenColCount = ALL_COLUMNS.length - draftVisibleColumns.size
  const hasDraftFilterChanges =
    !areSetsEqual(filterRoutes, draftFilterRoutes) ||
    !areSetsEqual(filterDeliveries, draftFilterDeliveries) ||
    !areSetsEqual(visibleColumns, draftVisibleColumns)

  // Sort — default: code asc, initialised from shared link if present
  const [sortKey, setSortKey] = useState<SortKey>(initHash.current?.sk ?? "code")
  const [sortDir, setSortDir] = useState<SortDir>(initHash.current?.sd ?? "asc")
  const [customSortOrders, setCustomSortOrders] = useState<SavedRowOrder[]>([])
  const [activeCustomSort, setActiveCustomSort] = useState<SavedRowOrder | null>(null)
  const prevFilterRoutesRef = useRef<Set<string>>(new Set())

  // Load saved row orders when exactly one route is filtered
  useEffect(() => {
    prevFilterRoutesRef.current = filterRoutes
    // Reset custom sort whenever filter changes
    setActiveCustomSort(null)
    if (filterRoutes.size === 1) {
      const [routeId] = filterRoutes
      try {
        const stored = localStorage.getItem(`fcalendar_my_sorts_${routeId}`)
        const parsed = stored ? JSON.parse(stored) : []
        setCustomSortOrders(Array.isArray(parsed) ? parsed : [])
      } catch {
        setCustomSortOrders([])
      }
    } else {
      setCustomSortOrders([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRoutes])

  useEffect(() => {
    if (!filterOpen) return
    setDraftFilterRoutes(new Set(filterRoutes))
    setDraftFilterDeliveries(new Set(filterDeliveries))
    setDraftVisibleColumns(new Set(visibleColumns))
  }, [filterOpen, filterRoutes, filterDeliveries, visibleColumns])

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/routes")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRoutes(json.data ?? json ?? [])
      setPendingEdits(new Map())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])
  useRegisterRefresh(fetchRoutes)

  // ── Pending-edit helpers ─────────────────────────────────────────────────
  const pointKey = (pt: FlatPoint) => `${pt.routeId}::${pt._rowIndex}`

  const effectiveDelivery = (pt: FlatPoint) =>
    pendingEdits.get(pointKey(pt)) ?? pt.delivery

  const saveChanges = useCallback(async () => {
    if (pendingEdits.size === 0 || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const updatedRoutes = routes.map(route => ({
        ...route,
        deliveryPoints: (route.deliveryPoints ?? []).map((pt, i) => {
          const key = `${route.id}::${i}`
          return pendingEdits.has(key) ? { ...pt, delivery: pendingEdits.get(key)! } : pt
        }),
      }))
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes: updatedRoutes }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRoutes(updatedRoutes)
      setPendingEdits(new Map())
      setHasUnsavedChanges(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEdits, isSaving, routes])

  // Register with global EditMode save
  useEffect(() => {
    if (pendingEdits.size === 0) return
    const unregister = registerSaveHandler(saveChanges)
    return unregister
  }, [pendingEdits.size, saveChanges, registerSaveHandler])

  // Notify context when pending edits change
  useEffect(() => {
    setHasUnsavedChanges(pendingEdits.size > 0)
  }, [pendingEdits.size, setHasUnsavedChanges])

  // ── Flatten all points + detect duplicates ───────────────────────────────
  const { flat, dupCodeCount, dupNameCount } = useMemo(() => {
    const all: FlatPoint[] = []
    routes.forEach(route => {
      (route.deliveryPoints ?? []).forEach((pt, i) => {
        all.push({ ...pt, routeId: route.id, routeName: route.name, routeCode: route.code, routeShift: route.shift ?? "", _rowIndex: i, _dupCode: false, _dupName: false })
      })
    })
    const codeCounts: Record<string, number> = {}
    const nameCounts: Record<string, number> = {}
    all.forEach(p => {
      codeCounts[p.code.trim().toLowerCase()] = (codeCounts[p.code.trim().toLowerCase()] ?? 0) + 1
      nameCounts[p.name.trim().toLowerCase()] = (nameCounts[p.name.trim().toLowerCase()] ?? 0) + 1
    })
    let dupCodeCount = 0
    let dupNameCount = 0
    all.forEach(p => {
      p._dupCode = codeCounts[p.code.trim().toLowerCase()] > 1
      p._dupName = nameCounts[p.name.trim().toLowerCase()] > 1
      if (p._dupCode) dupCodeCount++
      if (p._dupName) dupNameCount++
    })
    return { flat: all, dupCodeCount, dupNameCount }
  }, [routes])

  // ── Unique options for filters ─────────────────────────────────────────
  const routeOptions = useMemo(() =>
    [...new Map(routes.map(r => [r.id, `${r.name} (${r.code})`])).entries()],
  [routes])
  const deliveryOptions = useMemo(() => {
    const known = DELIVERY_ITEMS.map(d => d.value)
    const extra = flat.map(p => p.delivery).filter(v => !DELIVERY_MAP.has(v))
    return [...known, ...new Set(extra)]
  }, [flat])

  // ── Filter + Sort ──────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = flat
    if (search.trim()) {
      const { nameQuery, shiftFilter } = parseSmartQuery(search)
      const q = nameQuery.toLowerCase()
      if (q) {
        list = list.filter(p =>
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.routeName.toLowerCase().includes(q) ||
          p.routeCode.toLowerCase().includes(q) ||
          p.delivery.toLowerCase().includes(q)
        )
      }
      if (shiftFilter) {
        list = list.filter(p => p.routeShift.toUpperCase() === shiftFilter)
      }
    }
    if (filterRoutes.size > 0)     list = list.filter(p => filterRoutes.has(p.routeId))
    if (filterDeliveries.size > 0) list = list.filter(p => filterDeliveries.has(p.delivery))

    // Custom pts filter from shared link (stable ref, no dep needed)
    const sharedPts = initHash.current?.pts
    if (sharedPts && sharedPts.length > 0) {
      const allowed = new Set(sharedPts)
      list = list.filter(p => allowed.has(p.code))
    }

    if (activeCustomSort) {
      const orderIndex = new Map(activeCustomSort.order.map((code, idx) => [code, idx]))
      const sorted = [...list].sort((a, b) => {
        const ai = orderIndex.get(a.code)
        const bi = orderIndex.get(b.code)
        if (ai == null && bi == null) return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
        if (ai == null) return 1
        if (bi == null) return -1
        if (ai !== bi) return ai - bi
        return a._rowIndex - b._rowIndex
      })
      return isOptimized ? nearestNeighborSort(sorted) : sorted
    }

    const sorted = [...list].sort((a, b) => {
      let av = "", bv = ""
      if (sortKey === "code")     { av = a.code;      bv = b.code }
      if (sortKey === "name")     { av = a.name;      bv = b.name }
      if (sortKey === "delivery") { av = a.delivery;  bv = b.delivery }
      if (sortKey === "route")    { av = a.routeName; bv = b.routeName }
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" })
      return sortDir === "asc" ? cmp : -cmp
    })
    return isOptimized ? nearestNeighborSort(sorted) : sorted
  }, [flat, search, filterRoutes, filterDeliveries, sortKey, sortDir, activeCustomSort, isOptimized])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const totalPoints = flat.length
  const locationRoadDistances = useRoadDistances(
    DEFAULT_MAP_CENTER,
    displayed,
    'direct',
  )
  const pointDistances = useMemo(() => {
    const distances = new Map<string, string>()
    displayed.forEach((pt, i) => {
      const hasCoordinates = pt.latitude !== 0 || pt.longitude !== 0
      if (!hasCoordinates) return
      const value = locationRoadDistances.segments[i]
      if (value === null || value === undefined) return
      distances.set(pointKey(pt), formatKm(value))
    })
    return distances
  }, [displayed, locationRoadDistances])

  const [savedLinks, setSavedLinks]     = useState<SavedLink[]>(loadSavedLinks)
  const [linksOpen, setLinksOpen]       = useState(false)
  const [isShortening, setIsShortening] = useState(false)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel]   = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [generateConfirm, setGenerateConfirm] = useState(false)

  const customSavedLinks = useMemo(() => savedLinks.filter(link => link.type === "custom"), [savedLinks])
  const shareSavedLinks = useMemo(() => savedLinks.filter(link => link.type === "share"), [savedLinks])

  const commitEdit = (id: string) => {
    const trimmed = editingLabel.trim()
    if (!trimmed) return setEditingLinkId(null)
    const updated = savedLinks.map(l => l.id === id ? { ...l, label: trimmed } : l)
    setSavedLinks(updated)
    persistLinks(updated)
    setEditingLinkId(null)
  }

  const confirmDelete = (id: string) => {
    const updated = savedLinks.filter(l => l.id !== id)
    setSavedLinks(updated)
    persistLinks(updated)
    setDeleteConfirmId(null)
  }

  const renderSavedLinkItem = (link: SavedLink) => {
    const isEditing  = editingLinkId === link.id
    const isDeleting = deleteConfirmId === link.id
    return (
      <div key={link.id} className="px-3 py-3 hover:bg-muted/25 transition-colors bg-card/50">
        {isEditing ? (
          <div className="space-y-2 mb-1.5">
            <input
              autoFocus
              value={editingLabel}
              onChange={e => setEditingLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(link.id); if (e.key === "Escape") setEditingLinkId(null) }}
              className="w-full text-[12px] font-semibold bg-muted/60 border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="flex flex-wrap items-center gap-1 mt-2">
              <button
                onClick={() => commitEdit(link.id)}
                className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditingLinkId(null)}
                className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[12px] font-semibold text-foreground truncate mb-0.5">{link.label}</p>
        )}
        <p className="text-[11px] text-primary/80 break-all font-mono">{link.shortUrl}</p>
        <p className="text-[10px] text-muted-foreground/55 mt-0.5">
          {new Date(link.createdAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })}
        </p>
        {isDeleting && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-destructive/8 border border-destructive/20">
            <span className="text-[11px] text-destructive font-medium flex-1">Delete this link?</span>
            <button onClick={() => confirmDelete(link.id)} className="h-6 px-2.5 rounded text-[11px] font-semibold bg-destructive text-white hover:bg-destructive/90 transition-colors">Yes</button>
            <button onClick={() => setDeleteConfirmId(null)} className="h-6 px-2.5 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors">No</button>
          </div>
        )}
        {!isEditing && !isDeleting && (
          <div className="flex items-center gap-0.5 mt-2">
            <button onClick={() => { setEditingLinkId(link.id); setEditingLabel(link.label) }} className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="size-3" />Edit</button>
            <button onClick={() => navigator.clipboard.writeText(link.shortUrl).then(() => toast.success("Copied!"))} className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Copy className="size-3" />Copy</button>
            <a href={link.shortUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><ExternalLink className="size-3" />Open</a>
            <button onClick={() => setDeleteConfirmId(link.id)} className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-auto"><Trash2 className="size-3" />Delete</button>
          </div>
        )}
      </div>
    )
  }

  const generateCustomTableLink = async () => {
    const codes = [...selectedCodes]
    if (codes.length === 0) { toast.error("Select at least one point"); return }
    const encoded = encodeViewState({
      s: "", r: [], d: [],
      sk: "code", sd: "asc",
      vc: ["no", "code", "name", "delivery", "action"],
      ro: 1,
      pts: codes,
      ctitle: customTableTitle.trim() || "Custom Location Table",
    })
    const longUrl = `${window.location.origin}/#loc=${encoded}`
    setCtGenerating(true)
    const shortUrl = await shortenUrl(longUrl)
    setCtGenerating(false)
    setCtGeneratedLink(shortUrl)
    const newLink: SavedLink = {
      id: crypto.randomUUID(),
      label: customTableTitle.trim() || "Custom Location Table",
      longUrl,
      shortUrl,
      createdAt: new Date().toISOString(),
      type: "custom",
    }
    const updated = [newLink, ...savedLinks].slice(0, 50)
    setSavedLinks(updated)
    persistLinks(updated)
    navigator.clipboard.writeText(shortUrl)
      .then(() => toast.success("Custom table link copied!"))
      .catch(() => {})
  }

  const generateLink = async () => {
    const encoded = encodeViewState({
      s:  search,
      r:  [...filterRoutes],
      d:  [...filterDeliveries],
      sk: sortKey,
      sd: sortDir,
      vc: [...visibleColumns],
      ro: 1,
    })
    const longUrl = `${window.location.origin}/#loc=${encoded}`
    setIsShortening(true)
    const shortUrl = await shortenUrl(longUrl)

    const label = search.trim()
      ? `"${search.trim()}"`
      : filterRoutes.size > 0
        ? `Route: ${[...filterRoutes].slice(0, 3).join(", ")}${filterRoutes.size > 3 ? "…" : ""}`
        : "Location view"

    const newLink: SavedLink = {
      id: crypto.randomUUID(),
      label,
      longUrl,
      shortUrl,
      createdAt: new Date().toISOString(),
      type: "share",
    }
    const updated = [newLink, ...savedLinks].slice(0, 50)
    setSavedLinks(updated)
    persistLinks(updated)
    setShareGeneratedLink(shortUrl)

    navigator.clipboard.writeText(shortUrl)
      .then(() => toast.success("Short link copied!"))
      .catch(() => toast.error("Failed to copy link"))
    setIsShortening(false)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 border rounded-xl overflow-hidden shadow-sm bg-background">

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b bg-muted/40 shrink-0">
        {!loading && !error && (
          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums shrink-0">
            {displayed.length} / {totalPoints} point(s) · {routes.length} route(s)
          </span>
        )}
        {!loading && !error && dupCodeCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-2 py-1 rounded-full">
            <AlertTriangle className="w-3 h-3" />{dupCodeCount} dup code
          </span>
        )}
        {!loading && !error && dupNameCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 px-2 py-1 rounded-full">
            <AlertTriangle className="w-3 h-3" />{dupNameCount} dup name
          </span>
        )}
        {/* ── Optimised badge ── */}
        {isOptimized && (
          <span className="flex items-center gap-1 h-6 px-3 rounded-full border border-blue-700 bg-blue-600 text-white shadow-sm shadow-blue-700/20 ring-1 ring-blue-600/10 text-[10px] font-semibold shrink-0">
            <Navigation2 className="size-2.5 text-white" />Optimised
          </span>
        )}
        {/* ── Read-only badge (shared view) / unified Links action ── */}
        {isSharedView ? (
          <span className="ml-auto flex items-center gap-1 h-6 px-2 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-semibold shrink-0">
            <Info className="size-2.5" />Read-only
          </span>
        ) : (
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLinksOpen(true)
                setLinksTab("custom")
                setGenerateConfirm(false)
                setCtGeneratedLink(null)
                setSelectedCodes(new Set())
                setCustomTableTitle("")
              }}
              disabled={loading}
              className="h-7 gap-1.5 text-xs relative"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Links
              {savedLinks.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-1">
                  {savedLinks.length}
                </span>
              )}
            </Button>
          </div>
        )}

        <Dialog open={linksOpen} onOpenChange={open => {
          setLinksOpen(open)
          if (!open) {
            setGenerateConfirm(false)
            setEditingLinkId(null)
            setDeleteConfirmId(null)
            setLinksTab("custom")
            setSelectedCodes(new Set())
            setCustomTableTitle("")
            setCtGeneratedLink(null)
          }
        }}>
          <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-2xl" style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Bookmark className="size-4 text-primary" /> Links
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                Create a custom table, generate a share link, or manage saved links.
              </DialogDescription>
            </DialogHeader>

            <div className="px-5 pb-5">
              <Tabs value={linksTab} onValueChange={(val: string) => setLinksTab(val as "custom" | "share" | "saved") }>
                <TabsList className="gap-2 mb-4">
                  <TabsTrigger value="custom">Custom</TabsTrigger>
                  <TabsTrigger value="share">Share Link</TabsTrigger>
                  <TabsTrigger value="saved">Saved Links</TabsTrigger>
                </TabsList>

                <TabsContent value="custom">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <p className="text-[13px] font-semibold text-foreground">Create custom table</p>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        Select points from the current view and generate a shortened custom table link.
                      </p>
                    </div>

                    <Input
                      placeholder="Table title (optional)"
                      value={customTableTitle}
                      onChange={e => setCustomTableTitle(e.target.value)}
                      className="h-9 text-[12px] rounded-lg"
                    />

                    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 accent-primary cursor-pointer"
                          checked={selectedCodes.size === displayed.length && displayed.length > 0}
                          onChange={e => {
                            if (e.target.checked) setSelectedCodes(new Set(displayed.map(p => p.code)))
                            else setSelectedCodes(new Set())
                          }}
                        />
                        Select all ({displayed.length} points)
                      </label>
                      <span className="text-primary font-semibold">{selectedCodes.size} selected</span>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-border/30 rounded-xl border border-border/60">
                      {displayed.map((pt, i) => (
                        <label
                          key={`${pt.routeId}-${pt.code}-${i}`}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0"
                            checked={selectedCodes.has(pt.code)}
                            onChange={e => {
                              setSelectedCodes(prev => {
                                const s = new Set(prev)
                                e.target.checked ? s.add(pt.code) : s.delete(pt.code)
                                return s
                              })
                            }}
                          />
                          <span className="text-[11px] font-semibold text-muted-foreground w-16 shrink-0 truncate">{pt.code}</span>
                          <span className="text-[11px] flex-1 truncate">{pt.name}</span>
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">{pt.routeCode}</span>
                        </label>
                      ))}
                    </div>

                    {ctGeneratedLink && (
                      <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 flex items-center gap-2">
                        <span className="flex-1 text-[11px] font-mono text-primary truncate">{ctGeneratedLink}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(ctGeneratedLink!).then(() => toast.success("Copied!"))}
                          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setLinksOpen(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={generateCustomTableLink}
                        disabled={selectedCodes.size === 0 || ctGenerating}
                        className="gap-1.5"
                      >
                        {ctGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Link className="size-3.5" />}
                        {ctGenerating ? "Generating…" : "Generate"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="share">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <p className="text-[13px] font-semibold text-foreground">Share link</p>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        Shorten the current view and save the shareable link to your list.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/40 p-3 space-y-3">
                      {!generateConfirm ? (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-semibold text-foreground">Generate new link</p>
                            <p className="text-[12px] text-muted-foreground mt-0.5">
                              Shorten &amp; save current view filter
                            </p>
                          </div>
                          <button
                            onClick={() => setGenerateConfirm(true)}
                            disabled={isShortening}
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50"
                            title="Generate new link"
                            aria-label="Generate new link"
                          >
                            <Link className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[13px] font-semibold text-foreground">Confirm generate link?</p>
                          <p className="text-[12px] text-muted-foreground">
                            A short link will be created, saved to list, and copied to clipboard.
                          </p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              onClick={async () => { await generateLink(); setGenerateConfirm(false) }}
                              disabled={isShortening}
                              className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                            >
                              {isShortening ? <Loader2 className="size-2.5 animate-spin" /> : <CheckCheck className="size-2.5" />}
                              {isShortening ? "Shortening…" : "Generate"}
                            </button>
                            <button
                              onClick={() => setGenerateConfirm(false)}
                              className="h-7 px-3 rounded-lg bg-muted hover:bg-muted/80 text-[12px] font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {shareGeneratedLink && (
                      <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 flex items-center gap-2">
                        <span className="flex-1 text-[11px] font-mono text-primary truncate">{shareGeneratedLink}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(shareGeneratedLink!).then(() => toast.success("Copied!"))}
                          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        <a
                          href={shareGeneratedLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="saved">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <p className="text-[13px] font-semibold text-foreground">Saved links</p>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        Custom links are shown first, share links are shown below.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          <span>Custom Links</span>
                          <span>{customSavedLinks.length}</span>
                        </div>
                        {customSavedLinks.length === 0 ? (
                          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-4 text-[12px] text-muted-foreground text-center">
                            No custom links saved.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-border/50 overflow-hidden">
                            {customSavedLinks.map(link => renderSavedLinkItem(link))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          <span>Share Links</span>
                          <span>{shareSavedLinks.length}</span>
                        </div>
                        {shareSavedLinks.length === 0 ? (
                          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-4 text-[12px] text-muted-foreground text-center">
                            No share links saved.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-border/50 overflow-hidden">
                            {shareSavedLinks.map(link => renderSavedLinkItem(link))}
                          </div>
                        )}
                      </div>
                    </div>

                    {savedLinks.length > 0 && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => { setSavedLinks([]); persistLinks([]); setDeleteConfirmId(null); setEditingLinkId(null) }}
                          className="text-[11px] text-destructive/60 hover:text-destructive transition-colors font-medium"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </DialogContent>
        </Dialog>
        {saveError && (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertCircle className="w-3.5 h-3.5" />{saveError}
          </span>
        )}
      </div>

      {/* ── Shared custom-table title banner ────────────────────────── */}
      {isSharedView && initHash.current?.ctitle && (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/15 shrink-0 flex items-center gap-2">
          <LayoutList className="size-3.5 text-primary/70 shrink-0" />
          <p className="text-[13px] font-semibold text-primary">{initHash.current.ctitle}</p>
        </div>
      )}

      {/* ── Search + Filter Bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 shrink-0">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="Search code, name, route… (e.g. KL am)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 pr-10 h-11 text-[12px] md:text-[12px] rounded-lg"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className={cn(
            "relative flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors shrink-0",
            (filterRoutes.size > 0 || filterDeliveries.size > 0 || hiddenColCount > 0)
              ? "border-primary bg-primary/10 text-primary"
              : "border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Filter
          {(filterRoutes.size + filterDeliveries.size + hiddenColCount) > 0 && (
            <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
              {filterRoutes.size + filterDeliveries.size + hiddenColCount}
            </span>
          )}
        </button>
        {/* ── Sort button ───────────────────────────────────────────── */}
        <div className="relative shrink-0">
          <button
            onClick={() => setSortOpen(v => !v)}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors",
              (activeCustomSort || sortKey !== "code" || sortDir !== "asc")
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
            Sort
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-xl shadow-lg w-44 py-1 overflow-hidden">
                {([
                  { key: "code" as SortKey,     label: "Code" },
                  { key: "name" as SortKey,     label: "Name" },
                  { key: "route" as SortKey,    label: "Route" },
                  { key: "delivery" as SortKey, label: "Delivery" },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { handleSort(key); setActiveCustomSort(null); setSortOpen(false) }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/60 transition-colors",
                      !activeCustomSort && sortKey === key ? "text-primary font-semibold" : "text-foreground"
                    )}
                  >
                    {label}
                    {!activeCustomSort && sortKey === key
                      ? (sortDir === "asc"
                          ? <ChevronUp className="w-3 h-3" />
                          : <ChevronDownIcon className="w-3 h-3" />)
                      : <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40" />}
                  </button>
                ))}
                <div className="mx-2 my-1 border-t border-border" />
                <button
                  onClick={() => { setIsOptimized(v => !v); setSortOpen(false) }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/60 transition-colors",
                    isOptimized ? "text-blue-700 dark:text-blue-300 font-semibold" : "text-foreground"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Navigation2 className="w-3 h-3" />
                    Optimise Route
                  </span>
                  {isOptimized && <Check className="w-3 h-3" />}
                </button>
                {customSortOrders.length > 0 && (
                  <>
                    <div className="mx-2 my-1 border-t border-border" />
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Sort List</p>
                    {customSortOrders.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setActiveCustomSort(s); setSortOpen(false) }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/60 transition-colors",
                          activeCustomSort?.id === s.id ? "text-primary font-semibold" : "text-foreground"
                        )}
                      >
                        <span className="truncate">{s.label}</span>
                        {activeCustomSort?.id === s.id && <Check className="w-3 h-3 shrink-0" />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Active Filters Row ──────────────────────────────────────── */}
      {(filterRoutes.size > 0 || filterDeliveries.size > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b bg-muted/10 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Active:</span>
          {[...filterRoutes].map(id => {
            const label = routeOptions.find(([rid]) => rid === id)?.[1] ?? id
            return (
              <span key={id} className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium border border-primary/20">
                {label}
                <button onClick={() => setFilterRoutes(prev => { const s = new Set(prev); s.delete(id); return s })} className="rounded-full hover:bg-primary/20 p-0.5 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )
          })}
          {[...filterDeliveries].map(d => {
            const item = DELIVERY_MAP.get(d)
            return (
              <span key={d} className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-medium border border-violet-500/20">
                {item ? item.label : d}
                <button onClick={() => setFilterDeliveries(prev => { const s = new Set(prev); s.delete(d); return s })} className="rounded-full hover:bg-violet-500/20 p-0.5 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )
          })}
          <button
            onClick={() => { setFilterRoutes(new Set()); setFilterDeliveries(new Set()) }}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline shrink-0"
          >Clear all</button>
        </div>
      )}

      {/* ── Filter Modal ────────────────────────────────────────────── */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="w-[92vw] max-w-sm p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-3 text-center items-center">
            <DialogTitle className="text-sm font-bold">Filter</DialogTitle>
          </DialogHeader>
          {/* Tabs */}
          <div className="flex border-b border-border justify-center px-4">
            {(["routes", "delivery", "columns"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-xs font-semibold capitalize border-b-2 transition-colors",
                  filterTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "routes"
                  ? `Routes${draftFilterRoutes.size > 0 ? ` (${draftFilterRoutes.size})` : ""}`
                  : tab === "delivery"
                  ? `Delivery${draftFilterDeliveries.size > 0 ? ` (${draftFilterDeliveries.size})` : ""}`
                  : <span className="flex items-center gap-1"><Columns2 className="w-3 h-3" />Columns{draftHiddenColCount > 0 ? ` (${draftHiddenColCount})` : ""}</span>}
              </button>
            ))}
          </div>
          {/* Tab content */}
          <div className="overflow-y-auto max-h-72 p-3 space-y-1.5">
            {filterTab === "routes" && routeOptions.map(([id, label]) => {
              const checked = draftFilterRoutes.has(id)
              return (
                <button
                  key={id}
                  onClick={() => setDraftFilterRoutes(prev => { const s = new Set(prev); checked ? s.delete(id) : s.add(id); return s })}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs text-left transition-colors",
                    checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40"
                  )}
                >
                  <span className={cn("flex shrink-0 items-center justify-center w-4 h-4 rounded border", checked ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                    {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </span>
                  <span className="font-medium">{label}</span>
                </button>
              )
            })}
            {filterTab === "delivery" && deliveryOptions.map(d => {
              const item = DELIVERY_MAP.get(d)
              const checked = draftFilterDeliveries.has(d)
              return (
                <button
                  key={d}
                  onClick={() => setDraftFilterDeliveries(prev => { const s = new Set(prev); checked ? s.delete(d) : s.add(d); return s })}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs text-left transition-colors",
                    checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40"
                  )}
                >
                  <span className={cn("flex shrink-0 items-center justify-center w-4 h-4 rounded border", checked ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                    {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </span>
                  <span className="font-medium">{item ? item.label : d}</span>
                  {item && <span className="ml-auto text-muted-foreground text-[10px]">{item.description}</span>}
                </button>
              )
            })}
            {filterTab === "columns" && (
              <>
                <p className="text-[10px] text-muted-foreground px-1 pb-1">Toggle which columns are visible in the table.</p>
                {ALL_COLUMNS.map(col => {
                  const visible = draftVisibleColumns.has(col.key)
                  return (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key, "draft")}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs text-left transition-colors",
                        visible ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      <span className={cn("flex shrink-0 items-center justify-center w-4 h-4 rounded border", visible ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                        {visible && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </span>
                      <span className="font-medium">{col.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{col.description}</span>
                    </button>
                  )
                })}
              </>
            )}
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              onClick={() => {
                if (filterTab === "columns") {
                  setDraftVisibleColumns(new Set(ALL_COLUMNS.map((col) => col.key)))
                } else {
                  setDraftFilterRoutes(new Set())
                  setDraftFilterDeliveries(new Set())
                }
              }}
              className="text-xs font-semibold text-orange-800 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300"
            >{filterTab === "columns" ? "Show all" : "Clear all"}</button>
            {hasDraftFilterChanges && (
              <button
                type="button"
                onClick={() => {
                  setFilterRoutes(new Set(draftFilterRoutes))
                  setFilterDeliveries(new Set(draftFilterDeliveries))
                  setVisibleColumns(new Set(draftVisibleColumns))
                  setFilterOpen(false)
                }}
                className="text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
              >
                Apply
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {activeActionPoint && (
        <RowInfoModal
          open={!!activeActionPoint}
          onOpenChange={(open) => { if (!open) setActiveActionPoint(null) }}
          point={activeActionPoint}
          isEditMode={false}
        />
      )}

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {loading && !flat.length && (
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="loading-shell flex items-center gap-2.5 text-muted-foreground">
            <Loader2 className="loading-spinner size-5 animate-spin" />
            <span className="text-sm loading-text">Loading routes…</span>
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* ── Table — fills remaining height, scrolls inside ── */}
      {(!loading || flat.length > 0) && !error && (() => {
        const tbodyKey = `${search}|${[...filterRoutes].sort().join(',')}|${[...filterDeliveries].sort().join(',')}|${sortKey}|${sortDir}`
        return (
        <div className="flex-1 overflow-auto min-h-0" style={{ animation: 'loc-table-fade 0.3s ease-out both' }}>
          <table className="border-collapse text-[11px] whitespace-nowrap min-w-max w-full">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm text-[11px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
              <tr>
                {visibleColumns.has("no")       && <th className="px-3 py-3 text-center w-10">#</th>}
                {visibleColumns.has("route")    && <th className="px-3 py-3 text-center">Route</th>}
                {visibleColumns.has("code")     && <th className="px-3 py-3 text-center">Code</th>}
                {visibleColumns.has("name")     && <th className="px-3 py-3 text-center">Name</th>}
                {visibleColumns.has("delivery") && <th className="px-3 py-3 text-center">Delivery</th>}
                {visibleColumns.has("km")       && <th className="px-3 py-3 text-center">KM</th>}
                {visibleColumns.has("action")   && <th className="px-2 py-3 text-center w-12">Action</th>}
              </tr>
            </thead>
            <tbody key={tbodyKey} className="font-semibold">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.size} className="text-center py-16 text-muted-foreground">
                    No results found.
                  </td>
                </tr>
              ) : (
                displayed.map((pt, idx) => (
                  <tr
                    key={`${pt.routeId}-${pt.code}-${idx}`}
                    style={{
                      animation: 'loc-row-in 0.22s ease-out both',
                      animationDelay: `${Math.min(idx * 18, 320)}ms`,
                    }}
                    className={cn(
                      "transition-colors duration-150",
                      (pt._dupCode || pt._dupName)
                        ? "bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-100/60 dark:hover:bg-amber-900/20"
                        : idx % 2 === 0 ? "hover:bg-muted/40" : "bg-muted/20 hover:bg-muted/40"
                    )}
                  >
                    {visibleColumns.has("no") && (
                      <td className="px-3 py-2 text-center text-muted-foreground w-10 text-[11px] tabular-nums">{idx + 1}</td>
                    )}
                    {visibleColumns.has("route") && (
                      <td className="px-3 py-2 text-center">
                        <span className="text-[11px] text-foreground">{pt.routeName}</span>
                      </td>
                    )}
                    {visibleColumns.has("code") && (
                      <td className="px-3 py-2 text-center">
                        <span className={cn("text-[11px] font-medium", pt._dupCode && "text-amber-600 dark:text-amber-400 font-bold")}>
                          {pt.code}
                        </span>
                        {pt._dupCode && <AlertTriangle className="inline w-3 h-3 ml-1 text-amber-500" />}
                      </td>
                    )}
                    {visibleColumns.has("name") && (
                      <td className="px-3 py-2 text-center">
                        <span className={cn("text-[11px]", pt._dupName && "text-rose-600 dark:text-rose-400 font-semibold")}>
                          {pt.name}
                        </span>
                        {pt._dupName && <AlertTriangle className="inline w-3 h-3 ml-1 text-rose-500" />}
                      </td>
                    )}
                    {visibleColumns.has("delivery") && (
                      <td className="px-3 py-2 text-center text-[11px]">
                        {effectiveDelivery(pt)}
                      </td>
                    )}
                    {visibleColumns.has("km") && (
                      <td className="px-3 py-2 text-center text-[11px] tabular-nums text-muted-foreground">
                        {pointDistances.get(pointKey(pt)) ?? ""}
                      </td>
                    )}
                    {visibleColumns.has("action") && (
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          className={`inline-flex size-6 items-center justify-center p-0 transition-colors ${
                            isDeliveryActive(pt.delivery)
                              ? 'text-emerald-600 hover:text-emerald-700'
                              : 'text-red-500 hover:text-red-600'
                          }`}
                          aria-label={`View info for ${pt.name}`}
                          title={`View info for ${pt.name}`}
                          onClick={() => setActiveActionPoint(pt)}
                        >
                          <Info className="size-3.5" />
                          <span className="sr-only">Info</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )
      })()}


      {/* ── Settings Modal ──────────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[92vw] max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <DialogHeader className="text-center items-center">
              <DialogTitle className="text-sm font-bold">Display Settings</DialogTitle>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto max-h-96 px-5 py-4 space-y-4">
            {/* Show/Hide Columns */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Visible Columns</p>
              <div className="space-y-2">
                {ALL_COLUMNS.map(col => {
                  const visible = visibleColumns.has(col.key)
                  return (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-xs text-left transition-colors",
                        visible ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      <span className={cn("flex shrink-0 items-center justify-center w-4 h-4 rounded border", visible ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                        {visible && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </span>
                      <span className="font-medium">{col.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Active Filters Info */}
            {(filterRoutes.size > 0 || filterDeliveries.size > 0) && (
              <div className="space-y-2.5 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Active Filters</p>
                <button
                  onClick={() => { setFilterRoutes(new Set()); setFilterDeliveries(new Set()) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )}

            <div className="space-y-2.5 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Column Preset</p>
              <button
                onClick={() => setVisibleColumns(new Set(DEFAULT_VISIBLE_COLUMNS))}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/15 transition-colors"
              >
                Reset to default columns
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

