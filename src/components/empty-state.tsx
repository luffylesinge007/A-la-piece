import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import type { ReactNode } from "react";

/**
 * Rich empty states — never a blank canvas.
 * Every empty screen explains why it's empty and proposes a next action.
 * `icon` accepts a Lucide component (preferred) or any ReactNode.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
  variant = "default",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: { label: string; to: string; variant?: "default" | "outline" }[];
  className?: string;
  variant?: "default" | "subtle";
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-secondary/40 to-transparent px-6 text-center",
        variant === "subtle" ? "py-8" : "py-12",
        className,
      )}
    >
      {typeof icon === "string" && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 select-none leading-none opacity-[0.12]",
            variant === "subtle" ? "text-[64px]" : "text-[88px]",
          )}
        >
          {icon}
        </span>
      )}
      <span
        className={cn(
          "relative grid place-items-center rounded-2xl border bg-card text-primary shadow-sm",
          variant === "subtle" ? "size-12" : "size-16",
        )}
      >
        {icon}
      </span>
      <h3 className="relative font-display text-lg font-bold">{title}</h3>
      <p className={cn("relative max-w-sm text-sm text-muted-foreground", variant === "subtle" && "text-xs")}>{description}</p>
      {actions && actions.length > 0 && (
        <div className="relative mt-2 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <Button key={a.label} asChild variant={a.variant ?? "default"}>
              <Link to={a.to}>{a.label}</Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
