import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { useState } from "react";
import { api, HttpError } from "../lib/api";
import { auth } from "../lib/auth";
import { FloatingInput } from "./FloatingInput";

type Mode = "login" | "register";

type Props = {
  onAuthed: () => void;
};

export function AuthCard({ onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  function fireConfetti() {
    const burst = (origin: { x: number; y: number }) =>
      confetti({
        particleCount: 80,
        spread: 70,
        startVelocity: 45,
        origin,
        colors: ["#a78bfa", "#f472b6", "#22d3ee", "#fde68a", "#34d399"],
        scalar: 1.05,
      });
    burst({ x: 0.3, y: 0.5 });
    burst({ x: 0.7, y: 0.5 });
    setTimeout(() => burst({ x: 0.5, y: 0.45 }), 180);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await api.register(email, password, fullName);
        // Auto-login after register
        const token = await api.login(email, password);
        auth.set(token.access_token);
        fireConfetti();
        setTimeout(onAuthed, 600);
      } else {
        const token = await api.login(email, password);
        auth.set(token.access_token);
        onAuthed();
      }
    } catch (err) {
      const message =
        err instanceof HttpError ? err.message : "Network error — is the backend running?";
      setError(message);
      setShake((s) => s + 1);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
  }

  return (
    <motion.div
      className="auth-card"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      key={shake}
    >
      <motion.div
        animate={shake > 0 ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-title">AskMyDocs</div>
            <div className="brand-sub">Talk to your documents</div>
          </div>
        </div>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`tab ${mode === "login" ? "is-active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`tab ${mode === "register" ? "is-active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Sign Up
          </button>
          <motion.div
            className="tab-indicator"
            animate={{ x: mode === "login" ? "0%" : "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === "register" ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "register" ? -20 : 20 }}
              transition={{ duration: 0.25 }}
            >
              {mode === "register" && (
                <FloatingInput
                  label="Full name (optional)"
                  value={fullName}
                  onChange={setFullName}
                  autoComplete="name"
                />
              )}
              <FloatingInput
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
              />
              <FloatingInput
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                showPasswordToggle
              />
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                className="form-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            className="primary-btn"
            disabled={loading}
            whileHover={!loading ? { scale: 1.02 } : {}}
            whileTap={!loading ? { scale: 0.98 } : {}}
          >
            {loading ? (
              <span className="spinner" aria-label="Loading" />
            ) : mode === "login" ? (
              "Sign in →"
            ) : (
              "Create account ✨"
            )}
          </motion.button>
        </form>

        <p className="fineprint">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </motion.div>
    </motion.div>
  );
}
