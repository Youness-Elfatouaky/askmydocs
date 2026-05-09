import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { AuthCard } from "./components/AuthCard";
import { Dashboard } from "./components/Dashboard";
import { api } from "./lib/api";
import { auth } from "./lib/auth";
import type { User } from "./lib/types";

type Status = "loading" | "anon" | "authed";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  async function refreshUser() {
    if (!auth.get()) {
      setStatus("anon");
      setUser(null);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
      setStatus("authed");
    } catch {
      auth.clear();
      setUser(null);
      setStatus("anon");
    }
  }

  useEffect(() => {
    refreshUser();
  }, []);

  function handleLogout() {
    auth.clear();
    setUser(null);
    setStatus("anon");
  }

  return (
    <>
      <AnimatedBackground />
      <AnimatePresence mode="wait">
        {status === "loading" && (
          <div key="loading" className="screen">
            <div className="boot-spinner" aria-label="Loading">
              <div className="spinner spinner-lg" />
            </div>
          </div>
        )}
        {status === "anon" && (
          <div key="auth" className="screen">
            <AuthCard onAuthed={refreshUser} />
          </div>
        )}
        {status === "authed" && user && (
          <Dashboard key="dash" user={user} onLogout={handleLogout} />
        )}
      </AnimatePresence>
    </>
  );
}
