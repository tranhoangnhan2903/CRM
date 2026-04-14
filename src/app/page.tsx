"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import viMessages from "@/locales/vi.json";

function getDefaultDashboardPath(role?: string) {
  if (role === "DOCTOR" || role === "SALES" || role === "RECEPTIONIST") {
    return "/dashboard/me";
  }
  return "/dashboard";
}

export default function LoginPage() {
  const loginCopy = {
    title: viMessages["login.heading"],
    subtitle: viMessages["login.title"],
    emailLabel: viMessages["login.email"],
    passwordLabel: viMessages["login.password"],
    submitIdle: viMessages["login.submit"],
    submitLoading: viMessages["login.submitting"],
    helper: viMessages["login.helper"],
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Đăng nhập thất bại");
        setLoading(false);
        return;
      }
      window.dispatchEvent(new Event("session-changed"));
      const nextPath = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
      router.push(nextPath || getDefaultDashboardPath(data.data?.user?.role));
    } catch {
      setError("Lỗi kết nối server");
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="login-page">
      <div className="login-card">
        <h1>{loginCopy.title}</h1>
        <p className="subtitle">{loginCopy.subtitle}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email">{loginCopy.emailLabel}</label>
            <input
              id="email"
              type="email"
              className="form-input"
              aria-label={loginCopy.emailLabel}
              placeholder="admin@clinic.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">{loginCopy.passwordLabel}</label>
            <input
              id="password"
              type="password"
              className="form-input"
              aria-label={loginCopy.passwordLabel}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? loginCopy.submitLoading : loginCopy.submitIdle}
          </button>
        </form>

        <p className="login-helper">{loginCopy.helper}</p>
      </div>
    </main>
  );
}
