type Props = {
  kind: "user" | "ai";
  name?: string;
  size?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ kind, name = "", size = 32 }: Props) {
  if (kind === "ai") {
    return (
      <div className="avatar avatar-ai" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} aria-hidden>
          <defs>
            <linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="1" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path
            d="M12 2 L13.6 7.6 L19.2 9.2 L13.6 10.8 L12 16.4 L10.4 10.8 L4.8 9.2 L10.4 7.6 Z"
            fill="url(#aiGrad)"
          />
          <circle cx="18" cy="17" r="1.6" fill="#fff" opacity="0.85" />
          <circle cx="6" cy="18" r="1" fill="#fff" opacity="0.7" />
        </svg>
      </div>
    );
  }
  return (
    <div className="avatar avatar-user" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name || "?")}
    </div>
  );
}
