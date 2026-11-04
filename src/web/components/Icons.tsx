import type { ReactNode } from 'react';

const S = (p: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {p.children}
  </svg>
);

export const Flame = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.4-5 .2 1.5 1 2.6 2.1 3 .3-3.4-1.2-6.4.5-9z" />
  </svg>
);
export const Snow = () => <S><path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18M9 3.5 12 6l3-2.5M9 20.5 12 18l3 2.5" /></S>;
export const Home = () => <S><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></S>;
export const Chart = () => <S><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></S>;
export const Cog = () => (
  <S>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </S>
);
export const Back = () => <S><path d="m15 18-6-6 6-6" /></S>;
export const Camera = () => <S><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="4" /></S>;
export const Play = () => <S><path d="m7 4 13 8-13 8z" /></S>;
export const Speaker = () => <S><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></S>;
export const Mute = () => <S><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" /></S>;
export const Close = () => <S><path d="M18 6 6 18M6 6l12 12" /></S>;
export const Info = () => <S><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></S>;
export const Alert = () => <S><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></S>;
export const Bulb = () => <S><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></S>;
export const Medal = () => <S><circle cx="12" cy="15" r="6" /><path d="M8.2 10.4 5 2h4l3 6 3-6h4l-3.2 8.4" /></S>;
export const Check = () => <S><path d="M20 6 9 17l-5-5" /></S>;

/** Simple per-body-area glyphs for the exercise list. */
export function AreaIcon({ id }: { id: string }) {
  if (id.includes('shoulder'))
    return <S><circle cx="12" cy="5" r="2.5" /><path d="M12 8v7M12 15l-3 6M12 15l3 6M4 9l8 1 8-1" /></S>;
  if (id.includes('sit'))
    return <S><circle cx="10" cy="4.5" r="2.5" /><path d="M10 7v6h6v8M10 13l-4 8M4 13h3M18 10v11" /></S>;
  return <S><circle cx="12" cy="4.5" r="2.5" /><path d="M12 7v6M12 13l-4 3 1 5M12 13l4 3-1 5M8 9h8" /></S>;
}
