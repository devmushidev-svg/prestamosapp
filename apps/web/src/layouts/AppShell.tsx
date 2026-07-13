import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, ChevronDown, FilePlus2, HandCoins, Home, LogOut, Menu, Settings2, User, Users, Wallet, X } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useBusinessConfig } from "../business/BusinessConfigContext";
import { BrandLockup, BrandLogo } from "../components/BrandLogo";
import { Button } from "../components/ui";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

type TabId = "inicio" | "cartera" | "empresa";

type RibbonGroupDef = { title: string; items: NavItem[] };

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "cartera", label: "Cartera", icon: Wallet },
  { id: "empresa", label: "Empresa", icon: Building2 },
];

/** Cinta agrupada (estilo ERP). Las fichas de préstamos, pagos y reportes se agregan aquí conforme avanza el MVP. */
const RIBBON: Record<TabId, RibbonGroupDef[]> = {
  inicio: [],
  cartera: [
    {
      title: "Préstamos",
      items: [
        { to: "/prestamos", label: "Préstamos", icon: HandCoins, end: true },
        { to: "/prestamos/nuevo", label: "Nuevo préstamo", icon: FilePlus2 },
      ],
    },
    {
      title: "Clientes",
      items: [{ to: "/clientes", label: "Clientes", icon: Users }],
    },
  ],
  empresa: [
    {
      title: "Negocio",
      items: [{ to: "/configuracion", label: "Datos del prestamista", icon: Settings2 }],
    },
  ],
};

const TAB_DEFAULT_PATH: Record<TabId, string> = {
  inicio: "/",
  cartera: "/prestamos",
  empresa: "/configuracion",
};

function tabFromPath(pathname: string): TabId {
  if (pathname === "/") return "inicio";
  if (/^\/configuracion(\/|$)/.test(pathname)) return "empresa";
  return "cartera";
}

const MOBILE_QUICK_ITEMS: NavItem[] = [
  { to: "/", label: "Panel", icon: Home, end: true },
];

function primaryTabButtonClasses(isActive: boolean) {
  return `inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3 sm:text-sm ${
    isActive ? "pf-top-tab-active" : "pf-top-tab-idle"
  }`;
}

function NavIcon({ icon: Icon, className = "" }: { icon: LucideIcon; className?: string }) {
  return <Icon className={`h-4 w-4 shrink-0 ${className}`.trim()} strokeWidth={2} aria-hidden />;
}

function DesktopRibbonGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pf-ribbon-group flex min-w-0 flex-col pl-2 first:border-l-0 first:pl-0 sm:pl-3">
      <div className="flex flex-row flex-wrap items-stretch gap-0.5 sm:gap-0">{children}</div>
      <p className="pf-ribbon-group-label mt-0.5 pt-0.5 text-center text-[10px] font-medium uppercase tracking-wide sm:text-[11px]">
        {title}
      </p>
    </div>
  );
}

function ribbonTileClassName(isActive: boolean) {
  return `group flex w-[6.25rem] shrink-0 flex-col items-stretch rounded-md border border-transparent p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pf-primary sm:w-[7.25rem] ${
    isActive ? "pf-ribbon-tile-active" : "pf-ribbon-tile-idle"
  }`;
}

function DesktopRibbonNavTile({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end ?? false} className={({ isActive }) => ribbonTileClassName(isActive)} title={item.label}>
      <div className="flex flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5">
        <span className="pf-ribbon-icon-shell flex size-10 shrink-0 items-center justify-center rounded-md [&>svg]:block [&>svg]:shrink-0">
          <Icon className="!size-5" strokeWidth={2} aria-hidden />
        </span>
        <span className="line-clamp-2 min-h-[2.25rem] w-full px-0.5 text-center text-[10px] font-semibold leading-tight text-pf-text sm:text-[11px]">
          {item.label}
        </span>
      </div>
    </NavLink>
  );
}

function RibbonLink({ item, onNavigate, stack }: { item: NavItem; onNavigate?: () => void; stack?: boolean }) {
  const linkClass = (isActive: boolean) =>
    `${
      stack ? "flex w-full items-center gap-2.5" : "inline-flex shrink-0 items-center gap-2"
    } whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 touch-manipulation md:rounded-md md:py-2 ${
      isActive
        ? "bg-gradient-to-r from-pf-primary-hover via-pf-primary to-[color:var(--pf-nav-pill-warm-to)] text-[color:var(--pf-text-on-brand)] shadow-md md:bg-gradient-to-r md:from-[color:var(--pf-nav-ink-from)] md:via-[color:var(--pf-nav-ink-via)] md:to-[color:var(--pf-nav-ink-to)] md:shadow-none"
        : "text-pf-text-secondary hover:bg-white/60 hover:text-pf-text active:scale-[0.99] md:text-pf-text-tertiary md:hover:bg-[color:var(--pf-surface-muted)]"
    }`;
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      className={({ isActive }) => linkClass(isActive)}
      title={item.label}
    >
      <NavIcon icon={item.icon} />
      {item.label}
    </NavLink>
  );
}

function MobileNavDrawer({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  const activeSection = tabFromPath(location.pathname);
  const [openSections, setOpenSections] = useState<Record<TabId, boolean>>(() => ({
    inicio: false,
    cartera: activeSection === "cartera",
    empresa: activeSection === "empresa",
  }));

  return (
    <div className="flex flex-col gap-4 p-3">
      <nav className="grid grid-cols-1 gap-2" aria-label="Accesos rápidos">
        {MOBILE_QUICK_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-[72px] min-w-0 flex-col items-start justify-between gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold shadow-sm transition active:scale-[0.98] touch-manipulation ${
                  isActive
                    ? "border-transparent bg-gradient-to-br from-pf-primary-hover to-[color:var(--pf-nav-pill-warm-to)] text-[color:var(--pf-text-on-brand)]"
                    : "border-[var(--pf-border-soft)] bg-white/75 text-pf-text-secondary hover:bg-white"
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="w-full truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-2">
        {TABS.filter((tab) => tab.id !== "inicio").map((tab) => {
          const TabIcon = tab.icon;
          const groups = RIBBON[tab.id].filter((g) => g.items.length > 0);
          if (groups.length === 0) return null;
          return (
            <section
              key={tab.id}
              className="overflow-hidden rounded-xl border border-[var(--pf-border-soft)] bg-white/55 shadow-sm"
            >
              <button
                type="button"
                className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left font-semibold text-pf-text touch-manipulation"
                onClick={() => setOpenSections((current) => ({ ...current, [tab.id]: !current[tab.id] }))}
                aria-expanded={openSections[tab.id]}
                aria-controls={`mobile-menu-${tab.id}`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-pf-primary-soft text-pf-primary-foreground">
                  <TabIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-pf-muted transition-transform ${openSections[tab.id] ? "rotate-180" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              {openSections[tab.id] ? (
                <div
                  id={`mobile-menu-${tab.id}`}
                  className="flex flex-col gap-4 border-t border-[var(--pf-border-soft)] px-2.5 pb-3 pt-3"
                >
                  {groups.map((g) => (
                    <div key={g.title}>
                      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-pf-muted">{g.title}</p>
                      <nav className="flex flex-col gap-1">
                        {g.items.map((item) => (
                          <RibbonLink key={item.to + item.label} item={item} onNavigate={onNavigate} stack />
                        ))}
                      </nav>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { config } = useBusinessConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromPath(location.pathname));
  const [sessionError, setSessionError] = useState("");
  const mobileDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setActiveTab(tabFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      mobileDrawerRef.current?.querySelector<HTMLElement>("[data-menu-close='true']")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileDrawerRef.current) return;
      const controls = Array.from(
        mobileDrawerRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [menuOpen]);

  function onLogout() {
    setSessionError("");
    void logout()
      .then(() => navigate("/login"))
      .catch(() => setSessionError("No pudimos cerrar la sesión. Inténtelo de nuevo."));
  }

  const ribbonGroups = RIBBON[activeTab].filter((g) => g.items.length > 0);
  const showRibbon = activeTab !== "inicio" && ribbonGroups.length > 0;

  return (
    <div className="min-h-screen min-h-dvh flex flex-col bg-transparent">
      {sessionError ? (
        <div
          className="fixed left-1/2 top-4 z-[60] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-pf-danger/30 bg-pf-danger-soft px-4 py-3 text-sm font-semibold text-pf-danger shadow-lg"
          role="alert"
        >
          <span>{sessionError}</span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => setSessionError("")}>
            Cerrar
          </button>
        </div>
      ) : null}
      {/* Móvil */}
      <header className="pf-mobile-shell-header sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2.5 md:hidden print:hidden pt-[max(0.35rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo size={40} withShadow className="ring-2 ring-white/80 shadow-lg shadow-[var(--pf-shadow-btn-soft)]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-pf-text">{config?.nombre_negocio || "MultiPréstamos"}</p>
            <p className="truncate text-xs font-medium text-pf-text-tertiary">Gestión de préstamos</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[var(--pf-glass-border)] bg-[color:var(--pf-surface-overlay)] px-3.5 py-2.5 text-sm font-semibold text-pf-text-secondary shadow-[var(--pf-shadow-btn-soft)] backdrop-blur-md transition active:scale-95 touch-manipulation"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label="Abrir menú principal"
        >
          <Menu className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Menú
        </button>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="pf-mobile-menu-scrim absolute inset-0"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            ref={mobileDrawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Menú principal"
            className="pf-mobile-drawer-shell absolute right-0 top-0 flex h-full w-[min(94vw,380px)] flex-col pt-[env(safe-area-inset-top)]"
          >
            <div className="pf-mobile-drawer-head flex items-center justify-between px-4 py-3.5 backdrop-blur-md">
              <div className="min-w-0">
                <span className="pf-drawer-title block">Menú</span>
                <span className="block truncate text-xs text-pf-muted">MultiPréstamos</span>
              </div>
              <button
                type="button"
                data-menu-close="true"
                className="rounded-xl border border-[var(--pf-border-soft)] bg-[color:var(--pf-surface-overlay)] p-2 text-pf-text-soft shadow-[var(--pf-shadow-btn-soft)] backdrop-blur-sm transition active:scale-95"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <MobileNavDrawer onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="pf-mobile-drawer-foot p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2 backdrop-blur-sm">
              <p className="truncate text-xs text-pf-muted">{user?.email}</p>
              <Button variant="secondary" className="w-full" onClick={onLogout}>
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                Salir
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Escritorio */}
      <header className="pf-app-shell-header sticky top-0 z-20 max-md:hidden print:hidden">
        <div className="flex h-11 items-center gap-4 px-3 lg:gap-6 lg:px-5">
          <NavLink
            to="/"
            className="shrink-0 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-pf-primary focus-visible:ring-offset-2"
          >
            <BrandLockup size={34} />
          </NavLink>

          <nav
            className="pf-top-tabs-shell flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg px-0.5 py-1 [scrollbar-width:thin] sm:px-1"
            aria-label="Sección principal"
          >
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    navigate(TAB_DEFAULT_PATH[tab.id]);
                  }}
                  className={primaryTabButtonClasses(activeTab === tab.id)}
                >
                  <TabIcon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 border-l border-white/15 pl-2 lg:pl-3">
            <span
              className="hidden max-w-[160px] items-center gap-1.5 truncate text-sm text-pf-text-soft min-[1100px]:inline-flex"
              title={user?.email}
            >
              <User className="h-4 w-4 shrink-0 text-pf-muted" strokeWidth={2} aria-hidden />
              <span className="truncate">{user?.displayName}</span>
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-pf-text-soft hover:text-pf-text"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Salir
            </button>
          </div>
        </div>

        {showRibbon ? (
          <div className="pf-ribbon-shell">
            <div className="overflow-x-auto [scrollbar-width:thin]">
              <nav
                className="flex min-h-[4.5rem] flex-row items-end gap-0 px-1 py-1 sm:min-h-[4.75rem] sm:px-2 sm:pb-1.5 sm:pt-1 lg:px-3"
                aria-label={`Accesos ${activeTab}`}
              >
                {ribbonGroups.map((g) => (
                  <DesktopRibbonGroup key={g.title} title={g.title}>
                    {g.items.map((item) => (
                      <DesktopRibbonNavTile key={item.to + item.label} item={item} />
                    ))}
                  </DesktopRibbonGroup>
                ))}
              </nav>
            </div>
          </div>
        ) : null}
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 min-w-0 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
