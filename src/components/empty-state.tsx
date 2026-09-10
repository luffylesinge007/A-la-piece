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
}: {
  emoji: ReactNode;
  title: string;
  description: string;
  actions?: { label: string; to: string; variant?: "default" | "outline" }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-secondary/40 to-transparent px-6 py-12 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 select-none text-[88px] leading-none opacity-[0.12]"
      >
        {typeof emoji === "string" ? emoji : null}
      </span>
      <span className="relative grid size-16 place-items-center rounded-2xl border bg-card text-3xl shadow-sm">
        {typeof emoji === "string" ? <span aria-hidden>{emoji}</span> : emoji}
      </span>
      <h3 className="relative font-display text-lg font-bold">{title}</h3>
      <p className="relative max-w-sm text-sm text-muted-foreground">{description}</p>
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
