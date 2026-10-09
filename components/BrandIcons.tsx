/**
 * Brand marks that the icon set does not ship.
 *
 * `lucide-react` (the only icon package in this project) deliberately excludes
 * third-party brand logos, so these are traced by hand. They are all
 * decorative — the surrounding link/button carries the accessible name — hence
 * the blanket `aria-hidden` and inherited `currentColor`.
 */

type IconProps = { className?: string };

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        fill="currentColor"
        d="M16.5 3h-3.1v11.4a2.6 2.6 0 1 1-2.2-2.6V8.6a5.8 5.8 0 1 0 5.3 5.8V8.7a7 7 0 0 0 4 1.3V6.9a4.2 4.2 0 0 1-4-3.9Z"
      />
    </svg>
  );
}

export function YouTubeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        fill="currentColor"
        d="M22.5 7.6a2.8 2.8 0 0 0-2-2C18.8 5.2 12 5.2 12 5.2s-6.8 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1.2 12c0 1.5.1 3 .3 4.4a2.8 2.8 0 0 0 2 2c1.7.4 8.5.4 8.5.4s6.8 0 8.5-.4a2.8 2.8 0 0 0 2-2c.2-1.4.3-2.9.3-4.4s-.1-3-.3-4.4ZM9.9 15.2V8.8l5.5 3.2-5.5 3.2Z"
      />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        fill="currentColor"
        d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z"
      />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        fill="currentColor"
        d="M17.5 3h3.3l-7.2 8.2L22 21h-6.6l-4.6-6-5.2 6H2.2l7.6-8.7L2 3h6.7l4.3 5.7L17.5 3Zm-1.2 16h1.8L7.8 4.9H5.9L16.3 19Z"
      />
    </svg>
  );
}

export function AppleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path
        fill="currentColor"
        d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.7 1.1 8.9.8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.3ZM14.2 5.9c.6-.8 1-1.9.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.4Z"
      />
    </svg>
  );
}

export function GooglePlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      {/* Four facets: the play triangle split along its fold lines. */}
      <path fill="#34A853" d="M3.6 2.4 13.5 12 3.6 21.6A1.7 1.7 0 0 1 3 20.3V3.7c0-.5.2-1 .6-1.3Z" />
      <path fill="#4285F4" d="M17.3 8.2 13.5 12 3.6 2.4a1.7 1.7 0 0 1 1.9-.2l11.8 6Z" />
      <path fill="#EA4335" d="M17.3 15.8 5.5 21.8c-.7.4-1.5.2-1.9-.2L13.5 12l3.8 3.8Z" />
      <path fill="#FBBC05" d="m21 10.9-3.7 4.9-3.8-3.8 3.8-3.8 3.7 1.9c.7.4.7 1.4 0 1.8Z" />
    </svg>
  );
}
