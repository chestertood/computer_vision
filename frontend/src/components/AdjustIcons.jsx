// Stroke-based icon set for the upcoming image-adjust panel.
// Style matches App.jsx header icons: viewBox 24x24, stroke=currentColor, strokeWidth 1.6, fill none.
const base = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none' };
const s = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function IconFilters(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 5v9M12 5v5M18 5v11" {...s} />
      <circle cx="6" cy="16" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function IconExposure(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" {...s} />
      <path d="M8 8h4M10 6v4" {...s} />
      <path d="M14 16h4" {...s} />
    </svg>
  );
}

export function IconContrast(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" {...s} />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
    </svg>
  );
}

export function IconCrop(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3v14a1 1 0 0 0 1 1h13M17 21V7a1 1 0 0 0-1-1H3" {...s} />
    </svg>
  );
}

export function IconSharpen(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4 20 19H4Z" {...s} />
    </svg>
  );
}

export function IconTint(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" {...s} />
    </svg>
  );
}

export function IconSaturation(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" {...s} />
      <path d="M4 20 20 4" fill="currentColor" fillOpacity="0.35" stroke="none" />
    </svg>
  );
}

export function IconBrightness(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" {...s} />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" {...s} />
    </svg>
  );
}

export function IconFade(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" {...s} />
      <rect x="12" y="4" width="8" height="16" rx="1.5" fill="currentColor" fillOpacity="0.25" stroke="none" />
    </svg>
  );
}

export function IconTilt(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9h16M4 15h16" {...s} transform="rotate(-6 12 12)" />
    </svg>
  );
}

export function IconVertical(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4 6 8v8l3 4M15 4l3 4v8l-3 4" {...s} />
    </svg>
  );
}

export function IconHorizontal(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9 8 6h8l4 3M4 15l4 3h8l4-3" {...s} />
    </svg>
  );
}

export function IconHighlights(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" {...s} />
      <path d="M12 8v8M15 9.5h3M15 12h3M15 14.5h3" {...s} />
    </svg>
  );
}

export function IconShadows(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" {...s} />
      <path d="M12 8v8M15 9.5h2M15 12h2M15 14.5h2" {...s} strokeDasharray="1.6 1.6" />
    </svg>
  );
}

export function IconVignette(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" {...s} />
      <circle cx="12" cy="12" r="5" {...s} />
    </svg>
  );
}

export function IconWarmth(props) {
  return (
    <svg {...base} {...props}>
      <path d="M11 4a1.5 1.5 0 0 1 3 0v9.5a3.5 3.5 0 1 1-3 0Z" {...s} />
      <circle cx="12.5" cy="16.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
