// Small stroke icons (inline SVG, inherit currentColor).
import type { ReactNode } from 'react';

const S = ({ children, size = 20, fill = 'none' }: { children: ReactNode; size?: number; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconScreen = () => (
  <S>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </S>
);
export const IconCamera = () => (
  <S>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10.5l5-3v9l-5-3z" />
  </S>
);
export const IconMic = () => (
  <S>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </S>
);
export const IconPause = () => (
  <S>
    <path d="M9 6v12M15 6v12" />
  </S>
);
export const IconPlay = () => (
  <S fill="currentColor">
    <path d="M8 5v14l11-7z" stroke="none" />
  </S>
);
export const IconSun = () => (
  <S>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </S>
);
export const IconMoon = () => (
  <S>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </S>
);
export const IconFolder = () => (
  <S size={18}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </S>
);
export const IconClose = () => (
  <S size={16}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IconPip = () => (
  <S>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="12" y="12" width="7" height="6" rx="1" fill="currentColor" />
  </S>
);
