import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bell, Compass, FileText, Home, LayoutGrid, LogOut, MessageSquare,
  Moon, Shield, Sun, Wallet, User, CalendarCheck, Settings, Sparkles,
} from "lucide-react";

import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { formatDateTime } from "@/lib/format";

export type AccountType = "teen" | "adult" | "parent" | "organization" | "admin" | "moderator";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  mobile?: boolean;
}

function navFor(type: AccountType | undefined): NavItem[] {
  if (type === "teen") {
    return [
      { to: "/accueil", label: "Accueil", icon: <Home className="size-4" />, mobile: true },
      { to: "/missions", label: "Missions", icon: <Compass className="size-4" />, mobile: true },
      { to: "/candidatures", label: "Candidatures", icon: <FileText className="size-4" /> },
      { to: "/reservations", label: "Réservations", icon: <CalendarCheck className="size-4" />, mobile: true },
      { to: "/messages", label: "Messages", icon: <MessageSquare className="size-4" />, mobile: true },
      { to: "/portefeuille", label: "Portefeuille", icon: <Wallet className="size-4" /> },
      { to: "/profil", label: "Profil", icon: <User className="size-4" />, mobile: true },
      { to: "/securite", label: "Sécurité", icon: <Shield className="size-4" /> },
    ];
  }
  return [
    { to: "/accueil", label: "Accueil", icon: <Home className="size-4" />, mobile: true },
    { to: "/missions", label: "Explorer", icon: <Compass className="size-4" /> },
    { to: "/missions/create", label: "Publier", icon: <Sparkles className="size-4" /> },
    { to: "/mes-missions", label: "Mes missions", icon: <LayoutGrid className="size-4" /> },
    { to: "/candidatures", label: "Candidatures", icon: <FileText className="size-4" />, mobile: true },
    { to: "/reservations", label: "Réservations", icon: <CalendarCheck className="size-4" />, mobile: true },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="size-4" />, mobile: true },
    { to: "/portefeuille", label: "Portefeuille", icon: <Wallet className="size-4" /> },
    { to: "/profil", label: "Profil", icon: <User className="size-4" /> },
    { to: "/securite", label: "Sécurité", icon: <Shield className="size-4" /> },
  ];
}

const TYPE_LABEL: Record<AccountType, string> = {
  teen: "Ado",
  adult: "Adulte",
  parent: "Parent",
  organization: "Organisation",
  admin: "Admin",
  moderator: "Modérateur",
};

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("alp-theme") as "light" | "dark" | "system") ?? "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = (t: "light" | "dark") => root.classList.toggle("dark", t === "dark");
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    apply(theme);
  }, [theme]);

  const cycle = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    localStorage.setItem("alp-theme", next);
  };

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label="Changer de thème">
      {theme === "light" ? <Sun className="size-4" /> : theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4 opacity-60" />}
    </Button>
  );
}

function NotificationsMenu() {
  const notifications = useQuery(api.notifications.listMine) ?? [];
  const unread = notifications.filter((n) => !n.read).length;
  const markAllRead = useMutation(api.notifications.markAllRead);
  const navigate = useNavigate();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllRead()}>
              Tout marquer lu
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune notification pour le moment 🕊️
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n._id}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent",
                  !n.read && "bg-primary/5",
                )}
                onClick={() => {
                  if (n.link) navigate(n.link);
                }}
              >
                <span className="text-sm font-medium leading-snug">{n.title}</span>
                {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-[11px] text-muted-foreground/70">{formatDateTime(n.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth() as any;
  const navigate = useNavigate();
  const items = navFor(user?.accountType);
  const isTeen = user?.accountType === "teen";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const firstName = profile?.firstName ?? user?.name ?? "toi";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/accueil" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">π</span>
            <span className="hidden sm:inline">À LA PIÈCE</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationsMenu />
            <Popover>
              <PopoverTrigger asChild>
                <button className="ml-1 rounded-full outline-none ring-primary/50 focus-visible:ring-2" aria-label="Menu du compte">
                  <Avatar className="size-8 border">
                    <AvatarFallback className="bg-primary/10 text-sm">
                      {profile?.avatarEmoji ?? "👤"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold">Bonjour {firstName} 👋</p>
                  <Badge variant="secondary" className="mt-1 text-[11px]">
                    {TYPE_LABEL[user?.accountType as AccountType] ?? "Membre"}
                  </Badge>
                </div>
                <div className="my-1 h-px bg-border" />
                <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <Link to="/profil"><User className="size-4" /> Mon profil</Link>
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <Link to="/parametres"><Settings className="size-4" /> Paramètres</Link>
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <Link to="/securite"><Shield className="size-4" /> Sécurité</Link>
                </Button>
                <div className="my-1 h-px bg-border" />
                <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={handleSignOut}>
                  <LogOut className="size-4" /> Se déconnecter
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col gap-1 border-r p-3 lg:flex">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          {isTeen && (
            <div className="mt-auto rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              🛡️ Besoin d'aide pendant une mission ? Le bouton <strong>SOS</strong> est toujours sur la page mission.
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 lg:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-lg lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {items.filter((i) => i.mobile).slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
