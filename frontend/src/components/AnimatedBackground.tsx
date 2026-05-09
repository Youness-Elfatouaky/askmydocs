import { motion } from "framer-motion";
import { useMemo } from "react";

const blobs = [
  {
    className: "blob blob-1",
    animate: { x: [0, 120, -60, 0], y: [0, -80, 70, 0], scale: [1, 1.1, 0.95, 1] },
    duration: 22,
  },
  {
    className: "blob blob-2",
    animate: { x: [0, -140, 70, 0], y: [0, 70, -100, 0], scale: [1, 0.9, 1.15, 1] },
    duration: 28,
  },
  {
    className: "blob blob-3",
    animate: { x: [0, 90, -110, 0], y: [0, -60, 100, 0], scale: [1, 1.2, 0.95, 1] },
    duration: 32,
  },
];

function PaperIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`paper-icon ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="paperGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path
        d="M14 6 H38 L50 18 V58 H14 Z"
        fill="url(#paperGrad)"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M38 6 V18 H50" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
      <line x1="20" y1="28" x2="44" y2="28" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="20" y1="36" x2="44" y2="36" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="20" y1="44" x2="36" y2="44" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

type Floater = {
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
  rotate: number;
};

function makeFloaters(seed: number): Floater[] {
  // Deterministic positions so the layout doesn't reshuffle on every render.
  const rng = (n: number) => {
    const x = Math.sin(seed * 9999 + n * 137) * 10000;
    return x - Math.floor(x);
  };
  return Array.from({ length: 8 }).map((_, i) => ({
    left: `${5 + rng(i) * 90}%`,
    top: `${5 + rng(i + 50) * 90}%`,
    size: 38 + rng(i + 100) * 32,
    duration: 18 + rng(i + 200) * 18,
    delay: rng(i + 300) * 6,
    rotate: rng(i + 400) * 360,
  }));
}

function Sparkles() {
  const stars = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: Math.random() * 6,
        duration: 2.4 + Math.random() * 3,
        size: 2 + Math.random() * 3,
      })),
    [],
  );
  return (
    <div className="sparkles" aria-hidden>
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="sparkle"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
          }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function AnimatedBackground() {
  const floaters = useMemo(() => makeFloaters(7), []);
  return (
    <div className="bg-wrapper" aria-hidden>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={b.className}
          animate={b.animate}
          transition={{ duration: b.duration, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      <div className="floaters">
        {floaters.map((f, i) => (
          <motion.div
            key={i}
            className="floater"
            style={{
              left: f.left,
              top: f.top,
              width: f.size,
              height: f.size,
            }}
            initial={{ rotate: f.rotate }}
            animate={{
              y: [0, -30, 10, 0],
              x: [0, 15, -10, 0],
              rotate: [f.rotate, f.rotate + 14, f.rotate - 8, f.rotate],
            }}
            transition={{
              duration: f.duration,
              delay: f.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <PaperIcon />
          </motion.div>
        ))}
      </div>

      <Sparkles />
      <div className="bg-grid" />
      <div className="bg-vignette" />
    </div>
  );
}
