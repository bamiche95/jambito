import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import InstallPwaBanner from "@/components/InstallPwaBanner";
import { HERO_IMAGE } from "@/components/home/heroImage";
import {
  MathDoodle,
  MortarboardDoodle,
  PencilDoodle,
  PlaneDoodle,
  Sparkle,
  Squiggle,
} from "@/components/home/Doodles";

/**
 * Landing-page hero.
 *
 * Split out of `app/page.tsx` so the decorative markup does not bury the
 * page's data fetching — the home page still reads the live price from the
 * database and renders the pricing section itself. This component is purely
 * presentational and takes no props; the two calls to action point at the same
 * destinations the old inline hero used (`/cbt` and the `#subjects` anchor), so
 * nothing about navigation changed.
 *
 * All doodles sit in one `aria-hidden`, `pointer-events-none` layer above the
 * artwork: they cannot intercept a tap meant for the buttons underneath and
 * they add nothing to the accessibility tree.
 */
export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-cream">
      {/* Two soft brand washes so the flat cream does not read as an empty
          page on the left half of the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-orange-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:py-16 lg:grid-cols-12 lg:gap-10 lg:py-20">
        <div className="lg:col-span-6">
          <span className="inline-flex items-center rounded-full bg-linear-to-r from-orange-500 via-pink-500 to-purple-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
            Built for Nigerian students
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.06] tracking-tight text-slate-900 md:text-5xl lg:text-[3.4rem]">
            Pass JAMB, WAEC &amp; POST UTME with confidence!
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Practice thousands of real past questions with a full CBT engine,
            instant explanations, and 100% offline access.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/practice"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-6 py-3.5 text-base font-bold text-white shadow-md shadow-brand-blue/25 transition hover:bg-blue-700 active:scale-[0.98]"
            >
              Start Practicing Free 🚀
            </Link>
            <a
              href="#subjects"
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-brand-orange px-6 py-3.5 text-base font-bold text-brand-orange transition hover:bg-orange-50 active:scale-[0.98]"
            >
              Browse Past Questions
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>

          {/* Phone install affordance, in its light variant — the cream hero is
              the reason `variant` exists on the banner. */}
          <div className="mt-6">
            <InstallPwaBanner variant="light" />
          </div>
        </div>

        <div className="relative lg:col-span-6">
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            {/* Branded panel behind the artwork. It reserves the visual space
                even while the image loads (the source is a local file in
                public/images — see components/home/heroImage.ts). */}
            <div
              aria-hidden
              className="absolute inset-x-2 bottom-4 top-6 rounded-[2.5rem] bg-linear-to-br from-orange-100/80 via-amber-50 to-blue-100/80"
            />

            <Image
              src={HERO_IMAGE.src}
              alt={HERO_IMAGE.alt}
              width={HERO_IMAGE.width}
              height={HERO_IMAGE.height}
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="relative h-auto w-full"
            />

            <div aria-hidden className="pointer-events-none absolute inset-0">
              <Sparkle className="absolute -left-1 top-2 h-6 w-6 sm:h-8 sm:w-8" />
              <Sparkle color="#F97316" className="absolute right-2 top-0 h-4 w-4" />
              <Sparkle color="#2563EB" className="absolute -right-2 top-1/2 h-5 w-5" />
              <Sparkle color="#10B981" className="absolute bottom-8 left-4 h-4 w-4" />
              <PencilDoodle className="absolute -left-3 bottom-16 h-8 w-8 -rotate-45 sm:h-10 sm:w-10" />
              {/* Recoloured for the cream hero; the default white is the
                  footer's navy variant. */}
              <PlaneDoodle className="absolute -right-1 bottom-2 h-8 w-8 rotate-12 fill-white stroke-slate-400 sm:h-10 sm:w-10" />
              <MortarboardDoodle className="absolute -top-4 left-1/2 h-9 w-9 -rotate-12 sm:h-11 sm:w-11" />
              <Squiggle
                color="#10B981"
                className="absolute -left-4 top-1/3 h-3 w-10 -rotate-12"
              />
              <MathDoodle className="absolute right-0 top-8 h-8 w-12" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
