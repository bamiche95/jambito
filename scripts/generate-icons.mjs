import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Derives every icon the site ships from the two brand originals in
 * `assets/brand/` — the square app badge (`app-icon.jpg`) and the horizontal
 * lockup (`logo-lockup.png`).
 *
 * The sources live *outside* `public/` on purpose: Serwist precaches everything
 * it finds in `public/`, and the 1.9 MB badge JPEG has no business in an
 * offline install. Only the optimised outputs below get served.
 *
 * Run with `npm run icons`. Re-run it whenever a source is replaced.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const BADGE = path.join(root, "assets", "brand", "app-icon.jpg");
const LOCKUP = path.join(root, "assets", "brand", "logo-lockup.png");

const ICONS_DIR = path.join(root, "public", "icons");
/** `app/` files are picked up by Next's metadata file conventions. */
const APP_DIR = path.join(root, "app");

fs.mkdirSync(ICONS_DIR, { recursive: true });

/**
 * The badge is opaque, so its own corner colour is the right padding tone for
 * the maskable variant and for the manifest's splash/theme colours.
 */
async function cornerColour(file) {
  const { data } = await sharp(file)
    .extract({ left: 2, top: 2, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

const badgeBackground = await cornerColour(BADGE);
const hex = (channel) => channel.toString(16).padStart(2, "0");
const backgroundHex = `#${hex(badgeBackground.r)}${hex(badgeBackground.g)}${hex(badgeBackground.b)}`;

/**
 * Writes a PNG and returns its byte length, so the report below states what
 * actually landed on disk.
 */
async function png(pipeline, file, options = {}) {
  const buffer = await pipeline
    .png({ compressionLevel: 9, effort: 10, ...options })
    .toBuffer();
  fs.writeFileSync(file, buffer);
  return buffer.length;
}

const written = [];
async function emit(label, file, bytes) {
  const { width, height } = await sharp(file).metadata();
  written.push({ label, file: path.relative(root, file), width, height, bytes });
}

/* --------------------------------------------------------------------------
 * App icons
 * ----------------------------------------------------------------------- */

await emit(
  "icon 192",
  path.join(ICONS_DIR, "icon-192.png"),
  await png(
    sharp(BADGE).resize(192, 192, { fit: "cover" }),
    path.join(ICONS_DIR, "icon-192.png"),
  ),
);

await emit(
  "icon 512",
  path.join(ICONS_DIR, "icon-512.png"),
  await png(
    sharp(BADGE).resize(512, 512, { fit: "cover" }),
    path.join(ICONS_DIR, "icon-512.png"),
  ),
);

/*
 * Maskable: Android crops this to its own shape and only guarantees the centre
 * 80% circle. The art is drawn at 88% and padded with its own background, which
 * keeps the whole radar ring inside that circle under every launcher mask.
 */
const maskableInner = Math.round(512 * 0.88);
const maskableArt = await sharp(BADGE)
  .resize(maskableInner, maskableInner, { fit: "cover" })
  .png()
  .toBuffer();
await emit(
  "maskable 512",
  path.join(ICONS_DIR, "maskable-512.png"),
  await png(
    sharp({
      create: { width: 512, height: 512, channels: 3, background: badgeBackground },
    }).composite([{ input: maskableArt, gravity: "center" }]),
    path.join(ICONS_DIR, "maskable-512.png"),
  ),
);

/* --------------------------------------------------------------------------
 * The lockup rendered by <BrandLogo /> (header + footer)
 * ----------------------------------------------------------------------- */

/*
 * The export carries uneven transparent margins — 27px on the left, 15px on
 * the right, 8/14px top and bottom — so an untrimmed render sits slightly
 * right of the page gutter and looks smaller than the box it is given.
 * Trimming to the artwork's alpha bounds makes the lockup fill its height and
 * align flush with everything below it.
 */
await emit(
  "logo lockup",
  path.join(ICONS_DIR, "logo.png"),
  await png(sharp(LOCKUP).trim({ threshold: 1 }), path.join(ICONS_DIR, "logo.png")),
);

/* --------------------------------------------------------------------------
 * Next metadata file conventions: browser tab, iOS home screen, /favicon.ico
 * ----------------------------------------------------------------------- */

await emit(
  "app/icon",
  path.join(APP_DIR, "icon.png"),
  await png(
    sharp(BADGE).resize(256, 256, { fit: "cover" }),
    path.join(APP_DIR, "icon.png"),
  ),
);

/*
 * iOS never reads the web app manifest for the home-screen icon — without an
 * apple-touch-icon it invents a blank tile. 180x180 is the size iOS asks for,
 * and the file must be opaque: iOS applies its own rounded mask.
 */
await emit(
  "app/apple-icon",
  path.join(APP_DIR, "apple-icon.png"),
  await png(
    sharp(BADGE).resize(180, 180, { fit: "cover" }),
    path.join(APP_DIR, "apple-icon.png"),
  ),
);

/** ICO container around embedded PNGs — the format every browser accepts. */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, buffer }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width (0 means 256)
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // palette colours
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs.map(({ buffer }) => buffer)]);
}

const faviconSizes = [32, 48];
const faviconPngs = await Promise.all(
  faviconSizes.map(async (size) => ({
    size,
    buffer: await sharp(BADGE)
      .resize(size, size, { fit: "cover" })
      // RGBA is mandatory: the ICO decoder Next uses to fingerprint
      // `app/favicon.ico` refuses RGB payloads ("The PNG is not in RGBA
      // format!") and fails the whole build.
      .ensureAlpha()
      .png()
      .toBuffer(),
  })),
);
const faviconFile = path.join(APP_DIR, "favicon.ico");
fs.writeFileSync(faviconFile, ico(faviconPngs));
written.push({
  label: "app/favicon.ico",
  file: path.relative(root, faviconFile),
  width: faviconSizes.join("/"),
  height: "-",
  bytes: fs.statSync(faviconFile).size,
});

/* --------------------------------------------------------------------------
 * Report
 * ----------------------------------------------------------------------- */

console.log(`Badge background sampled from the artwork: ${backgroundHex}\n`);
for (const { label, file, width, height, bytes } of written) {
  const dims = height === "-" ? `${width}px` : `${width}x${height}`;
  console.log(
    `${label.padEnd(16)} ${file.padEnd(30)} ${dims.padEnd(9)} ${(bytes / 1024).toFixed(1)} kB`,
  );
}
