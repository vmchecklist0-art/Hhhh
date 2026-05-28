import { useState } from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
  onItemClick,
  onSubItemClick,
  searchQuery = "",
  currentPage,
  openItem: controlledOpenItem,
  onOpenItemChange,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    color?: string
    page?: string
    isActive?: boolean
    items?: {
      title: string
      url: string
      page?: string
    }[]
  }[]
  onItemClick?: (title: string) => void
  onSubItemClick?: (page: string) => void
  searchQuery?: string
  currentPage?: string
  openItem?: string | null
  onOpenItemChange?: (item: string | null) => void
}) {
  const initialOpen = items.find((i) => i.isActive && i.items?.length)?.title ?? null
  const [localOpenItem, setLocalOpenItem] = useState<string | null>(initialOpen)

  const isControlled = controlledOpenItem !== undefined
  const openItem = isControlled ? controlledOpenItem : localOpenItem
  const setOpenItem = (val: string | null) => {
    if (isControlled) onOpenItemChange?.(val)
    else setLocalOpenItem(val)
  }

  const isSearching = searchQuery.trim().length > 0

  const handleToggle = (title: string, hasChildren: boolean, page?: string) => {
    if (!hasChildren) {
      if (page) onSubItemClick?.(page)
      else onItemClick?.(title)
      return
    }
    setOpenItem(openItem === title ? null : title)
    onItemClick?.(title)
  }

  return (
    <SidebarGroup className="py-0">
      <SidebarMenu className="gap-0.5">
        {items.map((item) => {
          const hasChildren = !!item.items?.length
          const isOpen = isSearching ? true : openItem === item.title
          const isGroupActive = item.isActive

          return (
            <Collapsible
              key={item.title}
              asChild
              open={hasChildren ? isOpen : undefined}
              onOpenChange={hasChildren ? (open) => { if (!isSearching) setOpenItem(open ? item.title : null) } : undefined}
            >
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={item.title}
                  className={`font-medium text-[12.5px] h-8 transition-all duration-150 ${
                    isGroupActive ? "text-sidebar-foreground" : ""
                  }`}
                  onClick={() => handleToggle(item.title, hasChildren, item.page)}
                >
                  {/* Colored icon with subtle bg when active */}
                  <div className={`size-5 rounded-md flex items-center justify-center shrink-0 transition-colors duration-150 ${
                    isGroupActive
                      ? "bg-primary/10"
                      : "bg-transparent group-hover/menu-button:bg-muted/60"
                  }`}>
                    <item.icon
                      className="size-3 shrink-0"
                      style={{ color: item.color ?? "hsl(var(--sidebar-primary))" }}
                    />
                  </div>
                  <span className="flex-1">{item.title}</span>
                  {/* Active indicator dot */}
                  {isGroupActive && !isOpen && (
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{ background: item.color ?? "hsl(var(--primary))" }}
                    />
                  )}
                </SidebarMenuButton>

                {hasChildren ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction
                        className="transition-transform duration-250 ease-out data-[state=open]:rotate-90 hover:bg-sidebar-accent/50 rounded-md"
                      >
                        <ChevronRight className="size-3" />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>

                    {/* Animated sub-menu */}
                    <div
                      aria-hidden={!isOpen}
                      style={{
                        display: "grid",
                        gridTemplateRows: isOpen ? "1fr" : "0fr",
                        transition: "grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease",
                        opacity: isOpen ? 1 : 0,
                      }}
                    >
                      <div className="overflow-hidden">
                        <SidebarMenuSub
                          className={`ml-1 border-l-2 border-sidebar-border/50 pl-2 my-0.5 transition-all duration-250 ${
                            !isOpen ? "pointer-events-none" : ""
                          }`}
                          style={{
                            borderColor: isGroupActive
                              ? (item.color ?? "hsl(var(--primary))")
                              : undefined,
                          }}
                        >
                          {item.items?.map((subItem) => {
                            const isSubActive = currentPage === subItem.page
                            return (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton
                                  className={`font-medium text-[12px] h-7 transition-all duration-150 rounded-md ${
                                    isSubActive
                                      ? "bg-primary/12 text-primary font-semibold"
                                      : "hover:bg-sidebar-accent/50"
                                  }`}
                                  isActive={isSubActive}
                                  onClick={() => {
                                    if (subItem.page) onSubItemClick?.(subItem.page)
                                  }}
                                >
                                  {/* Active marker */}
                                  <span
                                    className={`size-1.5 rounded-full shrink-0 transition-all duration-150 ${
                                      isSubActive ? "opacity-100 scale-100" : "opacity-0 scale-0"
                                    }`}
                                    style={{ background: item.color ?? "hsl(var(--primary))" }}
                                  />
                                  <span className="flex-1">{subItem.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )
                          })}
                        </SidebarMenuSub>
                      </div>
                    </div>
                  </>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
