import type { ReactNode } from 'react';

/** Simple line icons (DESIGN 2.3): consistent stroke, colored by the surrounding text. */
function LineIcon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PlusIcon() {
  return (
    <LineIcon>
      <path d="M12 5v14M5 12h14" />
    </LineIcon>
  );
}

export function CloseIcon({ size = 24 }: { size?: number }) {
  return (
    <LineIcon size={size}>
      <path d="M6 6l12 12M18 6L6 18" />
    </LineIcon>
  );
}

export function TrashIcon() {
  return (
    <LineIcon>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </LineIcon>
  );
}

export function DragHandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="3" r="1.4" />
      <circle cx="10.5" cy="3" r="1.4" />
      <circle cx="5.5" cy="8" r="1.4" />
      <circle cx="10.5" cy="8" r="1.4" />
      <circle cx="5.5" cy="13" r="1.4" />
      <circle cx="10.5" cy="13" r="1.4" />
    </svg>
  );
}
