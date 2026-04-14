"use client";

import { useCallback, useEffect, useState } from "react";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  departmentId?: string | null;
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        setUser(result.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const listener = () => {
      void refresh();
    };

    window.addEventListener("session-changed", listener);
    return () => window.removeEventListener("session-changed", listener);
  }, [refresh]);

  return { user, loading, refresh };
}
