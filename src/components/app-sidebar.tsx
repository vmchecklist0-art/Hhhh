"use client"

import * as React from "react"
import fmLogo from "../../icon/fmlogo.png"
import sidebarBgLogo from "../../icon/IMG_0011.jpeg"
import { CalendarDays, Cog, House, Images, Loader as Loader2, Moon, Package, Pencil, Search, Sun, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useEditMode } from "@/contexts/EditModeContext"
import { useTheme } from "@/hooks/use-theme"
import {
  useSidebar,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenuButton,
  SidebarMenu,
  SidebarMenuItem,
  SidebarGroup,
} from "@/components/ui/sidebar"
import { NavMain } from "@/components/nav-main"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchesSearch(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase())
}

function getOpenSectionForPage(page: string | undefined): string | null {
  if (!page) return null
  if (["route-list", "deliveries", "custom"].includes(page)) return "Operations"
  if (page === "rooster") return "Schedule"
  if (["plano-vm", "gallery-album"].includes(page)) return "Gallery"
  return null
}

// ─── Nav item definitions ────────────────────────────────────────────────────

const ALL_NAV_ITEMS = [
  {
    title: "Operations",
    url: "#",
    icon: Package,
    color: "hsl(var(--accent-emerald))",
    items: [
      { title: "Route List", url: "#", page: "route-list" },
      { title: "Location",   url: "#", page: "deliveries" },
      { title: "Custom",     url: "#", page: "custom" },
    ],
  },
  {
    title: "Schedule",
    url: "#",
    icon: CalendarDays,
    color: "hsl(var(--accent-indigo))",
    items: [
      { title: "Rooster", url: "#", page: "rooster" },
    ],
  },
  {
    title: "Gallery",
    url: "#",
    icon: Images,
    color: "hsl(var(--accent-pink))",
    items: [
      { title: "Plano VM", url: "#", page: "plano-vm" },
      { title: "Album",    url: "#", page: "gallery-album" },
    ],
  },
] as const

// ─── Main component ───────────────────────────────────────────────────────────

export function AppSidebar({
  onNavigate,
  currentPage,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  onNavigate?: (page: string) => void
  currentPage?: string
}) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [unsavedDialogOpen, setUnsavedDialogOpen] = React.useState(false)
  const [isEditModeTransitioning, setIsEditModeTransitioning] = React.useState(false)
  const [openItem, setOpenItem] = React.useState<string | null>(
    () => getOpenSectionForPage(currentPage)
  )

  const { setOpenMobile } = useSidebar()
  const { isEditMode, setIsEditMode, hasUnsavedChanges, saveChanges, isSaving, discardChanges } = useEditMode()
  const { mode, toggleMode } = useTheme()

  const q = searchQuery.trim()

  // Auto-open the section that contains the current page
  React.useEffect(() => {
    const section = getOpenSectionForPage(currentPage)
    if (section) setOpenItem(section)
  }, [currentPage])

  // ── Navigation handler ─────────────────────────────────────────────────────
  const navigate = React.useCallback(
    (page: string) => {
      onNavigate?.(page)
      setOpenMobile(false)
    },
    [onNavigate, setOpenMobile]
  )

  // ── Edit mode ──────────────────────────────────────────────────────────────
  const applyEditModeChange = (next: boolean) => {
    setIsEditModeTransitioning(true)
    window.setTimeout(() => {
      setIsEditMode(next)
      setIsEditModeTransitioning(false)
    }, 260)
  }

  const handleEditModeToggle = () => {
    if (isEditModeTransitioning) return
    if (isEditMode && hasUnsavedChanges) {
      setUnsavedDialogOpen(true)
    } else {
      applyEditModeChange(!isEditMode)
    }
  }

  // ── Build filtered nav items ───────────────────────────────────────────────
  type NavItemDef = {
    title: string
    url: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    color: string
    isActive?: boolean
    page?: string
    items?: { title: string; url: string; page?: string }[]
  }

  const navItems: NavItemDef[] = React.useMemo(() => {
    const withActive = ALL_NAV_ITEMS.map(section => ({
      ...section,
      isActive: section.items.some(i => i.page === currentPage),
      items: [...section.items],
    }))

    if (!q) return withActive

    return withActive
      .map(section => {
        const parentMatch = matchesSearch(section.title, q)
        const filteredChildren = section.items.filter(sub =>
          matchesSearch(sub.title, q)
        )
        if (parentMatch) return { ...section }
        if (filteredChildren.length > 0) return { ...section, items: filteredChildren }
        return null
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
  }, [currentPage, q])

  const showHome   = !q || matchesSearch("Home", q)
  const showSettings = !q || matchesSearch("Settings", q)
  const noResults  = q.length > 0 && !showHome && navItems.length === 0 && !showSettings
  const isSettingsActive = currentPage?.startsWith("settings") ?? false

  return (
    <>
      <Sidebar {...props} variant="floating">
        <div className="flex flex-col h-full min-h-0">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <SidebarHeader className="p-0 shrink-0">

            {/* Hero banner */}
            <div className="relative overflow-hidden h-[90px] rounded-t-[18px]">
              <img
                src={sidebarBgLogo}
                alt=""
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  mode === "light" ? "opacity-70" : "opacity-50"
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-background/90" />

              {/* FM logo inside banner */}
              <button
                type="button"
                onClick={() => navigate("home")}
                className="absolute bottom-2 left-3 flex items-center gap-2 group"
                aria-label="Go to home"
              >
                <div className="size-9 rounded-xl bg-background/80 backdrop-blur-sm border border-border/40 shadow-sm flex items-center justify-center group-hover:bg-background transition-colors duration-150">
                  <img
                    src={fmLogo}
                    alt="FM logo"
                    className="h-7 w-7 object-contain"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-white/90 leading-tight drop-shadow">Dbrutals</span>
                  <span className="text-[9.5px] text-white/60 leading-tight drop-shadow">Delivery App</span>
                </div>
              </button>
            </div>

            {/* Search */}
            <div className="relative px-3 pt-2.5 pb-1.5">
              <Search className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 size-[13px] text-muted-foreground/60" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-input/70 bg-muted/50 pl-8 pr-7 text-[12px] outline-none transition-all duration-150 placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-ring/50 focus:bg-background focus:border-ring/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 size-4 flex items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 transition-colors"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </div>
          </SidebarHeader>

          {/* ── Content ─────────────────────────────────────────────────── */}
          <SidebarContent className="px-2 py-0.5 gap-0 overflow-y-auto min-h-0">

            {/* Home */}
            {showHome && (
              <SidebarGroup className="py-0 pt-1 pb-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Home"
                      isActive={currentPage === "home"}
                      className="font-medium text-[12.5px] h-8 transition-all duration-150 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                      onClick={() => navigate("home")}
                    >
                      <House
                        className="size-[14px] shrink-0"
                        style={{ color: currentPage === "home" ? "hsl(var(--primary))" : "hsl(var(--accent-indigo))" }}
                      />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* Divider after Home */}
            {showHome && navItems.length > 0 && !q && (
              <div className="mx-3 my-1 border-t border-sidebar-border/30" />
            )}

            {/* Main menu with submenus */}
            {navItems.length > 0 && (
              <NavMain
                items={navItems as Parameters<typeof NavMain>[0]["items"]}
                onSubItemClick={navigate}
                searchQuery={q}
                currentPage={currentPage}
                openItem={openItem}
                onOpenItemChange={setOpenItem}
              />
            )}

            {/* Divider before Settings */}
            {showSettings && !q && (
              <div className="mx-3 my-1 border-t border-sidebar-border/30" />
            )}

            {/* Settings */}
            {showSettings && (
              <SidebarGroup className="py-0 pb-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Settings"
                      isActive={isSettingsActive}
                      className="font-medium text-[12.5px] h-8 transition-all duration-150 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                      onClick={() => navigate("settings")}
                    >
                      <Cog
                        className="size-[14px] shrink-0"
                        style={{ color: isSettingsActive ? "hsl(var(--primary))" : "hsl(var(--accent-amber))" }}
                      />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* No results */}
            {noResults && (
              <div className="flex flex-col items-center gap-1.5 py-10 text-center animate-in fade-in duration-200">
                <div className="size-8 rounded-full bg-muted flex items-center justify-center mb-1">
                  <Search className="size-3.5 text-muted-foreground/50" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">No results for "{q}"</p>
                <p className="text-[11px] text-muted-foreground/50">Try a different keyword</p>
              </div>
            )}
          </SidebarContent>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <SidebarFooter className="px-2 pb-3 pt-1 shrink-0">

            {/* Divider */}
            <div className="border-t border-sidebar-border/40 mb-2" />

            {/* Quick action rows */}
            <div className="space-y-0.5">

              {/* Theme toggle row */}
              <button
                type="button"
                onClick={toggleMode}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-sidebar-accent/40 transition-colors duration-150 group"
              >
                <div className={`size-6 rounded-md flex items-center justify-center shrink-0 ${mode === "dark" ? "bg-slate-700/60" : "bg-amber-100/80"}`}>
                  {mode === "dark"
                    ? <Moon className="size-3.5 text-slate-300" />
                    : <Sun className="size-3.5 text-amber-500" />}
                </div>
                <span className="flex-1 text-[12px] font-medium text-sidebar-foreground text-left">
                  {mode === "dark" ? "Dark Mode" : "Light Mode"}
                </span>
                <span onClick={e => e.stopPropagation()} className="shrink-0">
                  <Switch
                    size="sm"
                    checked={mode === "dark"}
                    onCheckedChange={toggleMode}
                  />
                </span>
              </button>

              {/* Edit mode toggle row */}
              <button
                type="button"
                onClick={handleEditModeToggle}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-sidebar-accent/40 transition-colors duration-150 ${isEditMode ? "bg-emerald-500/8" : ""}`}
              >
                <div className={`size-6 rounded-md flex items-center justify-center shrink-0 ${isEditMode ? "bg-emerald-500/20" : "bg-muted/60"}`}>
                  {isEditModeTransitioning
                    ? <Loader2 className="size-3.5 animate-spin text-primary" />
                    : <Pencil className={`size-3.5 ${isEditMode ? "text-emerald-500" : "text-muted-foreground"}`} />}
                </div>
                <span className="flex-1 text-[12px] font-medium text-sidebar-foreground text-left">
                  {isEditModeTransitioning ? "Switching…" : "Edit Mode"}
                </span>
                {!isEditModeTransitioning && (
                  <span onClick={e => e.stopPropagation()} className="shrink-0">
                    <Switch
                      size="sm"
                      checked={isEditMode}
                      onCheckedChange={handleEditModeToggle}
                    />
                  </span>
                )}
              </button>

            </div>

            {/* Version badge */}
            <div className="mt-2 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground/40 font-medium tracking-wide">
                Dbrutals v1.0
              </span>
            </div>

          </SidebarFooter>

        </div>
      </Sidebar>


      {/* Unsaved changes dialog */}
      <Dialog open={unsavedDialogOpen} onOpenChange={setUnsavedDialogOpen}>
        <DialogContent className="sm:max-w-md" style={{ zIndex: 300 }}>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. What would you like to do before turning off Edit Mode?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                discardChanges()
                setUnsavedDialogOpen(false)
                setIsEditMode(false)
              }}
            >
              Discard Changes
            </Button>
            <Button
              onClick={async () => {
                await saveChanges()
                setUnsavedDialogOpen(false)
                setIsEditMode(false)
              }}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save & Turn Off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
