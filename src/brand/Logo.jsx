/**
 * Reusable brand mark. Two pieces: the YoRemind drawer-tab monogram
 * (already part of the product identity) and, optionally, the
 * SayMyTech maker credit underneath it — used on the lock screen,
 * the sidebar, and the About section so the branding is consistent
 * everywhere instead of copy-pasted markup.
 */
export function YoRemindMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="4" fill="var(--wood-dark)" stroke="var(--idea)" strokeWidth="1.5" />
      <circle cx="20" cy="13" r="2.4" fill="var(--paper-light)" opacity="0.85" />
      <text x="20" y="29" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="14" fill="var(--paper-light)">
        YR
      </text>
    </svg>
  );
}

export function SayMyTechWordmark({ size = 'sm' }) {
  const scale = size === 'lg' ? 1 : size === 'sm' ? 0.75 : 0.9;
  return (
    <svg width={132 * scale} height={22 * scale} viewBox="0 0 132 22" aria-hidden="true">
      <text x="0" y="16" fontFamily="var(--font-display)" fontWeight="700" fontSize="15" fill="currentColor">
        SayMy<tspan fill="var(--idea)">Tech</tspan>
      </text>
    </svg>
  );
}

export function BrandFooter() {
  return (
    <div className="brand-footer">
      <SayMyTechWordmark size="sm" />
      <span className="brand-footer__credit">Developed by Steven Sema</span>
    </div>
  );
}
