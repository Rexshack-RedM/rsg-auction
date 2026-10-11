import type { ReactNode } from 'react';

// RedM (RDR3) craft primitives — pure Tailwind, referencing the --rdr-* theme tokens in
// styles.css. Composable building blocks, NOT a fixed layout. Compose new components freely;
// never write custom CSS.

export function MenuBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-[radial-gradient(140%_120%_at_50%_-10%,var(--rdr-bg-elev),var(--rdr-bg))] before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:bg-[radial-gradient(120%_100%_at_50%_40%,transparent_55%,rgba(0,0,0,0.6))]">
      {children}
    </div>
  );
}

type PanelVariant = 'framed' | 'plain' | 'inset';

const PANEL_VARIANTS: Record<PanelVariant, string> = {
  // Ornamental notched frame (SVG border-image). No border-radius — border-image ignores it.
  framed:
    'bg-[color:var(--rdr-surface)] border-[16px] border-solid border-transparent [border-image:var(--rdr-frame-image)_16_stretch]',
  plain: 'bg-[color:var(--rdr-surface)] border border-[color:var(--rdr-border)] rounded-md',
  inset: 'bg-[color:var(--rdr-bg)] border border-[color:var(--rdr-border)] rounded-md shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]',
};

// Top-level container. Use 'framed' for a hero panel, 'plain'/'inset' for secondary surfaces.
export function Panel({
  children,
  variant = 'framed',
  className = '',
}: {
  children: ReactNode;
  variant?: PanelVariant;
  className?: string;
}) {
  return <div className={PANEL_VARIANTS[variant] + ' ' + className}>{children}</div>;
}

// Content block used INSIDE a Panel — list rows, stat groups, grouped sections. Pass active
// for a selected state (red border); otherwise it gets a subtle hover. Sits on a slightly
// lighter surface so it reads as nested.
export function Card({
  children,
  active = false,
  className = '',
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const state = active
    ? 'border-[color:var(--rdr-red)]'
    : 'border-[color:var(--rdr-border)] hover:border-[color:var(--rdr-muted)]';
  return (
    <div
      onClick={onClick}
      className={'rounded-md border bg-[color:var(--rdr-surface-2)] p-4 transition-colors ' + state + ' ' + className}
    >
      {children}
    </div>
  );
}

type HeadingSize = 'sm' | 'md' | 'lg';

const HEADING_SIZES: Record<HeadingSize, string> = {
  sm: 'text-xs tracking-[0.22em]',
  md: 'text-lg tracking-[0.14em]',
  lg: 'text-3xl tracking-[0.1em]',
};

// Title font (display serif), uppercase + tracked. Body text must NOT use this component.
export function SectionHeading({
  children,
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  size?: HeadingSize;
  className?: string;
}) {
  return (
    <h2 className={'text-[color:var(--rdr-heading)] uppercase [font-family:var(--font-display)] ' + HEADING_SIZES[size] + ' ' + className}>
      {children}
    </h2>
  );
}

export function FlourishDivider({ ornament = '✦' }: { ornament?: string }) {
  return (
    <div className="flex items-center gap-3 text-[color:var(--rdr-red)] text-xs">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--rdr-line)]" />
      {ornament}
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--rdr-line)]" />
    </div>
  );
}

type ButtonVariant = 'primary' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[color:var(--rdr-red)] text-[color:var(--rdr-heading)] hover:bg-[color:var(--rdr-red-bright)]',
  ghost:
    'border border-[color:var(--rdr-border)] text-[color:var(--rdr-text)] hover:border-[color:var(--rdr-red)] hover:text-[color:var(--rdr-heading)]',
};

export function Button({
  children,
  variant = 'primary',
  className = '',
  onClick,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={BUTTON_VARIANTS[variant] + ' px-4 py-2 rounded-sm text-sm tracking-wide transition-colors ' + className}
    >
      {children}
    </button>
  );
}
