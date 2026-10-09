import { GraduationCap, Pencil, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Decorative doodles for the marketing surfaces (landing hero + site footer).
 *
 * These are hand-written SVG (or thin wrappers over lucide) rather than a
 * single icon set because the design calls for multi-colour, off-axis, filled
 * shapes — lucide is 24px single-stroke UI chrome and reads as a button, not an
 * illustration.
 *
 * Every piece is `aria-hidden` and positioned by the caller with absolute
 * utilities, so nothing here contributes to layout, focus order or the
 * accessibility tree. Colour is a prop rather than a class so the same shape
 * can be reused on the cream sections and the navy footer.
 */

export function Sparkle({
  className,
  color = "#FBBF24",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={className}
    >
      {/* Four-point concave star — a plain `Star` polygon reads as a badge. */}
      <path
        d="M12 0C13.2 6.9 17.1 10.8 24 12C17.1 13.2 13.2 17.1 12 24C10.8 17.1 6.9 13.2 0 12C6.9 10.8 10.8 6.9 12 0Z"
        fill={color}
      />
    </svg>
  );
}

export function Squiggle({
  className,
  color = "#F97316",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 44 12"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        d="M1 8c3.5-7 7-7 10.5 0s7 7 10.5 0 7-7 10.5 0"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The ÷, =, + and × marks scattered through the artwork. Drawn rather than
 * typeset so the stroke weight matches the other doodles at any size.
 */
export function MathDoodle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 40"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      <g stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
        <path d="M22 12h11" />
        <path d="M22 18h11" />
        <path d="M27.5 24v10" />
        <path d="M22.5 29h10" />
      </g>
      <g stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round">
        <path d="M3 20h10" />
      </g>
      <circle cx="8" cy="12" r="1.9" fill="#2563EB" />
      <circle cx="8" cy="28" r="1.9" fill="#2563EB" />
      <g stroke="#F97316" strokeWidth="2.5" strokeLinecap="round">
        <path d="M42 10l9 9" />
        <path d="M51 10l-9 9" />
      </g>
    </svg>
  );
}

/**
 * The three lucide-backed doodles. They only exist so the hero and the footer
 * share one import site and one colour decision for each shape; the rotation
 * and placement still come from the caller's `className`.
 */
export function PencilDoodle({ className }: { className?: string }) {
  return (
    <Pencil
      aria-hidden
      className={cn("fill-amber-200 stroke-amber-500", className)}
    />
  );
}

export function PlaneDoodle({ className }: { className?: string }) {
  return <Send aria-hidden className={cn("fill-white/80 stroke-white", className)} />;
}

export function MortarboardDoodle({ className }: { className?: string }) {
  return (
    <GraduationCap
      aria-hidden
      className={cn("fill-blue-100 stroke-brand-blue", className)}
    />
  );
}
