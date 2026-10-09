/**
 * Landing-page hero artwork.
 *
 * The single swap point for the illustration: components/home/Hero.tsx only
 * reads this object, so replacing the artwork never means editing a component.
 *
 * TEMPORARY — the source below is a remote placeholder because the finished
 * illustration has not been committed yet. To swap it in:
 *
 *   1. Save the artwork as `public/images/hero-students.png`.
 *   2. Point `src` at "/images/hero-students.png" and correct `width`/`height`
 *      if the aspect ratio differs (they are only used to reserve layout space
 *      so the hero does not jump while the image loads).
 *   3. Delete the `images.remotePatterns` entry in next.config.ts.
 *
 * The hero renders this inside a cream/blue gradient panel, so even a slow or
 * failed remote fetch shows a branded area rather than an empty white box.
 */
export const HERO_IMAGE = {
  src: "https://placehold.co/1376x768/faf8f5/f97316/png?text=Hero+illustration",
  alt: "Nigerian students studying together with laptops and tablets",
  width: 1376,
  height: 768,
} as const;
