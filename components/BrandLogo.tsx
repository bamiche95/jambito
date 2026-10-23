import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The exported lockup. Intrinsic size comes straight from the file in
 * `public/icons/` (written there by `scripts/generate-icons.mjs`, which trims
 * the artwork's transparent margins first), so no scaling happens before the
 * browser downscales it for a 32–56px-tall header. If the source artwork is
 * ever replaced, re-run `npm run icons` and update these two numbers from the
 * script's report.
 */
const LOCKUP = { src: "/icons/logo.png", width: 406, height: 127 };

/**
 * The CBT-Practice lockup used in the site chrome (header + footer).
 *
 * The left half of the artwork is navy, so it only reads on a light surface.
 * Anything that renders it over `bg-navy` — the footer — has to put it on its
 * own white plate; there is no dark variant of the mark yet.
 *
 * The height comes from the caller (`className="h-7"` etc.); `w-auto` plus the
 * intrinsic width keeps the 3:1 ratio. `eager` is for the header only: there the
 * logo is above the fold on every page, while the footer copy can stay lazy.
 * `preload`/`priority` are deliberately not used — Next 16 deprecated
 * `priority` in favour of `preload`, and preloading an 84px logo would only
 * compete with the LCP text (see
 * node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md).
 */
export default function BrandLogo({
  className,
  eager = false,
}: {
  className?: string;
  eager?: boolean;
}) {
  return (
    <Image
      src={LOCKUP.src}
      alt="CBT-Practice"
      width={LOCKUP.width}
      height={LOCKUP.height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      className={cn("w-auto", className)}
    />
  );
}
