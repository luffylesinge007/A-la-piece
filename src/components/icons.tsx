import {
  Baby, Bike, BookOpen, Briefcase, Building2, Cat, Clock, Crown, Dog, Dumbbell,
  Flame, Gamepad2, GraduationCap, Hammer, HeartHandshake, Laptop, Leaf, Medal,
  PartyPopper, PawPrint, Pin, Rocket, ShoppingBasket, ShieldAlert, ShieldCheck, Smile,
  Sparkles, Sprout, Star, Target, Trophy, UserRound, Users, Wand2, Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategory } from "@/convex/lib/safety";

/**
 * Pictogram registry — replaces all emoji with real Lucide icons.
 *
 * Shared data (categories, badges, avatars) stores icon *names* as strings,
 * so the Convex backend stays dependency-free and the client renders
 * consistent, brand-styled pictograms. Unknown or legacy emoji values
 * fall back gracefully (initials for avatars, a neutral icon elsewhere).
 */
export const ICONS: Record<string, LucideIcon> = {
  // Catégories
  "paw-print": PawPrint,
  "pin": Pin,
  "sprout": Sprout,
  "book-open": BookOpen,
  "laptop": Laptop,
  "shopping-basket": ShoppingBasket,
  "leaf": Leaf,
  "party-popper": PartyPopper,
  "baby": Baby,
  "hammer": Hammer,
  "bike": Bike,
  // Badges & gamification
  "medal": Medal,
  "flame": Flame,
  "trophy": Trophy,
  "star": Star,
  "sparkles": Sparkles,
  "zap": Zap,
  "dog": Dog,
  "crown": Crown,
  "clock": Clock,
  "dumbbell": Dumbbell,
  "target": Target,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  // Rôles / avatars
  "user": UserRound,
  "graduation-cap": GraduationCap,
  "briefcase": Briefcase,
  "building": Building2,
  "heart-handshake": HeartHandshake,
  "cat": Cat,
  "dog-face": Dog,
  "bird": Rocket, // rétro-compat
  "rocket": Rocket,
  "wand": Wand2,
  "gamepad": Gamepad2,
  "camera": Smile,
  "users": Users,
};

export type IconName = keyof typeof ICONS;

/** Pictograms offered as selectable profile avatars. */
export const AVATAR_CHOICES: string[] = [
  "graduation-cap",
  "user",
  "heart-handshake",
  "briefcase",
  "cat",
  "dog",
  "rocket",
  "wand",
  "gamepad",
  "star",
  "crown",
  "users",
  "target",
  "sprout",
];

/** Pictogram for a mission category object (`{ icon }` from the shared catalogue). */
export function CategoryIcon({
  category,
  className,
}: {
  category?: { icon?: string; label?: string } | null;
  className?: string;
}) {
  return <DataIcon name={category?.icon} className={className} fallback={Pin} />;
}

/** Pictogram from a category slug (e.g. "animaux" → paw-print). */
export function CategorySlugIcon({ slug, className }: { slug?: string | null; className?: string }) {
  const cat = slug ? getCategory(slug) : undefined;
  return <DataIcon name={cat?.icon} className={className} fallback={Pin} />;
}

/** Render a stored icon name; falls back to `fallback` when unknown/legacy. */
export function DataIcon({
  name,
  className,
  fallback = UserRound,
}: {
  name?: string | null;
  className?: string;
  fallback?: LucideIcon;
}) {
  // Legacy emoji payloads (pre-pictogram data) resolve to the fallback icon.
  const clean = name && !/[\u2190-\u2BFF\uFE0F]|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(name)
    ? name
    : null;
  const Icon = (clean && ICONS[clean]) || fallback;
  return <Icon className={className} aria-hidden />;
}

/** Avatar that renders the pictogram, or initials when no/legacy icon exists. */
export function ProfileAvatar({
  icon,
  name,
  className,
  iconClassName,
}: {
  icon?: string | null;
  name?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const legacy = icon && /[\u2190-\u2BFF\uFE0F]|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(icon);
  const initials =
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || null;

  if (icon && !legacy && ICONS[icon]) {
    const Icon = ICONS[icon];
    return <Icon className={cn("size-5", iconClassName)} aria-hidden />;
  }
  return (
    <span className={cn("grid place-items-center font-display font-bold", className)} aria-hidden>
      {initials ?? <UserRound className={cn("size-5", iconClassName)} />}
    </span>
  );
}
