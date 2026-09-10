import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import type { ReactNode } from "react";

/**
 * Rich empty states — never a blank canvas.
 * Every empty screen explains why it's empty and proposes a next action.
 */
export function EmptyState({
  emoji,
  title,
  description,
  actions,
  className,
  variant = "default",
}: {
  emoji: ReactNode;
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
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 select-none leading-none opacity-[0.12]",
          variant === "subtle" ? "text-[64px]" : "text-[88px]",
        )}
      >
        {typeof emoji === "string" ? emoji : null}
      </span>
      <span className={cn(
        "relative grid place-items-center rounded-2xl border bg-card shadow-sm",
        variant === "subtle" ? "size-12 text-2xl" : "size-16 text-3xl",
      )}>
        {typeof emoji === "string" ? <span aria-hidden>{emoji}</span> : emoji}
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
