/**
 * Landing-page hero artwork.
 *
 * The single swap point for the illustration: components/home/Hero.tsx only
 * reads this object, so replacing the artwork never means editing a component.
 *
 * The artwork is a local file in `public/`, which Next serves from the site
 * root: `public/images/hero_students.jpg` is requested as
 * "/images/hero_students.jpg". `next/image` needs exactly that root-relative
 * form (or a full URL) — a filesystem path or an import alias such as
 * "@public/..." is not a valid URL and throws when the image renders.
 *
 * To swap the artwork, replace `public/images/hero_students.jpg` (or point
 * `src` at the new file) and correct `width`/`height` if the aspect ratio
 * differs — they are only used to reserve layout space so the hero does not
 * jump while the image loads. The current values match the committed file
 * (1376x768).
 *
 * The hero renders this inside a cream/blue gradient panel, so even a slow or
 * failed load shows a branded area rather than an empty white box.
 */
export const HERO_IMAGE = {
  src: "/images/students_hero.png",
  alt: "Nigerian students studying together with laptops and tablets",
  width: 1376,
  height: 920,
} as const;
