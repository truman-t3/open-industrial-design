import type { SVGProps } from 'react';

export type UiIconName =
  | 'board'
  | 'box'
  | 'close'
  | 'copy'
  | 'hand'
  | 'home'
  | 'image'
  | 'more'
  | 'plus'
  | 'redo'
  | 'select'
  | 'sketch'
  | 'sliders'
  | 'text'
  | 'trash'
  | 'undo';

export function UiIcon({
  name,
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { name: UiIconName; size?: number }) {
  const paths: Record<UiIconName, React.ReactNode> = {
    board: (
      <>
        <rect height="14" rx="2" width="14" x="5" y="5" />
        <path d="M10 5v14M10 10h9" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    copy: (
      <>
        <rect height="11" rx="2" width="11" x="8" y="8" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    hand: (
      <path d="M7.5 11V7.5a1.5 1.5 0 0 1 3 0V10m0-3.5V5a1.5 1.5 0 0 1 3 0v5m0-3.5V6a1.5 1.5 0 0 1 3 0v5m0-2.5a1.5 1.5 0 0 1 3 0V13c0 5-2.7 8-7 8-3 0-4.4-1.5-6-3.7L4.7 14a1.6 1.6 0 0 1 2.5-2Z" />
    ),
    home: (
      <>
        <path d="m4 10 8-6 8 6" />
        <path d="M6.5 9.5V20h11V9.5M10 20v-6h4v6" />
      </>
    ),
    image: (
      <>
        <rect height="16" rx="2" width="18" x="3" y="4" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    redo: <path d="M20 7v5h-5M19 12a7 7 0 1 0-1.8 5" />,
    select: <path d="m5 3 13 9-6 1.5-3 5.5L5 3Z" />,
    sketch: (
      <>
        <path d="m4 17 1-4L15.5 2.5a2.1 2.1 0 0 1 3 3L8 16l-4 1Z" />
        <path d="m13.5 4.5 3 3M3 21h18" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
    text: <path d="M5 5h14M12 5v14M8 19h8" />,
    trash: (
      <>
        <path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    undo: <path d="M4 7v5h5M5 12a7 7 0 1 1 1.8 5" />,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
