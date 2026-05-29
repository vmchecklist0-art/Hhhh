"use client"

import * as React from "react"
import fmLogo from "../../icon/fmlogo.png"
import sidebarBgLogo from "../../icon/IMG_0011.jpeg"
import { CalendarDays, ChevronsUpDown, Cog, House, Images, Loader as Loader2, Moon, Package, Pencil, Search, Sun, X, Zap } from "lucide-react"
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
  const [actionOpen, setActionOpen] = React.useState(false)
  const actionRef = React.useRef<HTMLDivElement>(null)
  const touchStartYRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!actionOpen) return
    const handler = (e: MouseEvent) => {
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) {
        setActionOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [actionOpen])
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
            <div className="relative overflow-hidden h-[110px] rounded-t-[18px]">
              <img
                src={sidebarBgLogo}
                alt=""
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                  mode === "light" ? "opacity-75" : "opacity-60"
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background/70" />
            </div>

            {/* Search */}
            <div className="relative px-3 pt-2 pb-1">
              <Search className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 size-[14px] text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-muted/40 pl-9 pr-7 text-[12.5px] outline-none ring-0 transition-all duration-150 placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring focus:bg-background"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </SidebarHeader>

          {/* ── Content ─────────────────────────────────────────────────── */}
          <SidebarContent className="px-2 py-1 gap-0 overflow-y-auto min-h-0">

            {/* Home */}
            {showHome && (
              <SidebarGroup className="py-0 pt-1 pb-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Home"
                      isActive={currentPage === "home"}
                      className="font-medium transition-colors duration-150"
                      onClick={() => navigate("home")}
                    >
                      <House
                        className="size-[14px]"
                        style={{ color: "hsl(var(--accent-indigo))" }}
                      />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
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

            {/* Settings */}
            {showSettings && (
              <SidebarGroup className="py-0 pb-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Settings"
                      isActive={isSettingsActive}
                      className="font-medium transition-colors duration-150"
                      onClick={() => navigate("settings")}
                    >
                      <Cog
                        className="size-[14px]"
                        style={{ color: "hsl(var(--accent-amber))" }}
                      />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )}

            {/* No results */}
            {noResults && (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center animate-in fade-in duration-200">
                <p className="text-xs font-medium text-muted-foreground">No results</p>
                <p className="text-[11px] text-muted-foreground/50">Try a different keyword</p>
              </div>
            )}
          </SidebarContent>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <SidebarFooter className="px-2 pb-2 pt-1 shrink-0">

            {/* Action slide-up panel */}
            <div className="relative" ref={actionRef}>
              {/* Slide-up panel */}
              <div
                className="absolute bottom-full left-0 right-0 mb-2 z-[70] overflow-hidden rounded-xl border border-sidebar-border/60 bg-popover shadow-lg shadow-black/20"
                style={{
                  transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1)',
                  opacity: actionOpen ? 1 : 0,
                  transform: actionOpen ? 'translateY(0)' : 'translateY(10px)',
                  pointerEvents: actionOpen ? 'auto' : 'none',
                }}
                onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY }}
                onTouchEnd={e => {
                  if (touchStartYRef.current === null) return
                  const delta = e.changedTouches[0].clientY - touchStartYRef.current
                  touchStartYRef.current = null
                  if (delta > 50) setActionOpen(false)
                }}
              >
                <div className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Quick Actions
                </div>
                <div className="border-t border-border/50 mx-2" />

                {/* Theme */}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  {mode === "dark"
                    ? <Moon className="size-4 shrink-0 text-indigo-400" />
                    : <Sun className="size-4 shrink-0 text-amber-400" />}
                  <span className="flex-1 text-[12.5px] text-foreground text-left">
                    {mode === "dark" ? "Dark Mode" : "Light Mode"}
                  </span>
                  <span onClick={e => e.stopPropagation()}>
                    <Switch
                      size="sm"
                      className="fcal-switch-sidebar"
                      checked={mode === "dark"}
                      onCheckedChange={toggleMode}
                    />
                  </span>
                </button>

                {/* Edit mode */}
                <button
                  type="button"
                  onClick={handleEditModeToggle}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 transition-colors cursor-pointer ${isEditMode ? "text-primary" : ""}`}
                >
                  {isEditModeTransitioning
                    ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    : <Pencil className={`size-4 shrink-0 ${isEditMode ? "text-emerald-400" : "text-muted-foreground"}`} />}
                  <span className="flex-1 text-[12.5px] text-foreground text-left">
                    {isEditModeTransitioning ? "Switching…" : "Edit Mode"}
                  </span>
                  {!isEditModeTransitioning && (
                    <span onClick={e => e.stopPropagation()}>
                      <Switch
                        size="sm"
                        className="fcal-switch-sidebar"
                        checked={isEditMode}
                        onCheckedChange={handleEditModeToggle}
                      />
                    </span>
                  )}
                </button>
              </div>

              {/* Trigger button */}
              <button
                type="button"
                onClick={() => setActionOpen(v => !v)}
                className="w-full flex items-center gap-2.5 rounded-lg border border-sidebar-border/50 bg-sidebar-accent/20 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-sidebar-accent/40"
                style={{ background: actionOpen ? 'hsl(var(--sidebar-accent)/0.5)' : undefined }}
              >
                <Zap className="size-[15px] shrink-0 text-amber-400" />
                <span className="flex-1 text-[12.5px] font-medium text-sidebar-foreground">Action</span>
                <ChevronsUpDown
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
                  style={{ transform: actionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-sidebar-border/40 mt-1" />

            {/* FM Logo */}
            <div className="mx-auto flex items-center justify-center rounded-xl p-1">
              <img
                src={fmLogo}
                alt="FM logo"
                className="h-[72px] w-[72px] shrink-0 object-contain"
              />
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
