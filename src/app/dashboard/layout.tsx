"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";

const NAV_ITEMS = [
  { section: "Tổng quan", items: [
    { label: "Dashboard", href: "/dashboard", icon: "📊", roles: ["ADMIN", "ACCOUNTANT", "MANAGER"] },
    { label: "Cá nhân", href: "/dashboard/me", icon: "👤", roles: null },
  ]},
  { section: "CRM", items: [
    { label: "Khách hàng", href: "/dashboard/customers", icon: "👥", roles: null },
    { label: "Hành trình", href: "/dashboard/journeys", icon: "🧭", roles: ["ADMIN", "MANAGER", "ACCOUNTANT", "RECEPTIONIST"] },
    { label: "Leads", href: "/dashboard/leads", icon: "🎯", roles: ["ADMIN", "SALES", "RECEPTIONIST"] },
    { label: "Giới thiệu", href: "/dashboard/referrals", icon: "🤝", roles: null },
  ]},
  { section: "Vận hành", items: [
    { label: "Dịch vụ", href: "/dashboard/services", icon: "💊", roles: ["ADMIN"] },
    { label: "Gói khám", href: "/dashboard/packages", icon: "📦", roles: ["ADMIN", "MANAGER", "ACCOUNTANT", "RECEPTIONIST", "DOCTOR"] },
    { label: "Hóa đơn", href: "/dashboard/bills", icon: "🧾", roles: null },
  ]},
  { section: "Hoa hồng", items: [
    { label: "Hoa hồng", href: "/dashboard/commissions", icon: "💰", roles: ["ADMIN", "DOCTOR", "MANAGER", "SALES", "RECEPTIONIST"] },
    { label: "Chính sách", href: "/dashboard/policies", icon: "📋", roles: ["ADMIN"] },
    { label: "Ngưỡng thưởng", href: "/dashboard/executor-tiers", icon: "🎯", roles: ["ADMIN"] },
  ]},
  { section: "Hệ thống", items: [
    { label: "Đồng bộ HIS", href: "/dashboard/his", icon: "🔄", roles: ["ADMIN", "MANAGER"] },
    { label: "Người dùng", href: "/dashboard/users", icon: "🔑", roles: ["ADMIN"] },
    { label: "Khoa/phòng", href: "/dashboard/departments", icon: "🏢", roles: ["ADMIN"] },
    { label: "Audit Log", href: "/dashboard/audit", icon: "📜", roles: ["ADMIN"] },
  ]},
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user || pathname !== "/dashboard") {
      return;
    }

    const canViewExecutiveDashboard = ["ADMIN", "ACCOUNTANT", "MANAGER"].includes(user.role);
    if (!canViewExecutiveDashboard) {
      router.replace("/dashboard/me");
    }
  }, [pathname, router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    NAV_ITEMS.flatMap((section) => section.items)
      .filter((item) => !item.roles || item.roles.includes(user.role))
      .forEach((item) => {
        router.prefetch(item.href);
      });
  }, [router, user]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    window.dispatchEvent(new Event("session-changed"));
    router.push("/");
  }, [router]);

  if (loading || !user) return null;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🏥 Clinic CRM</h2>
          <span className="role-badge">{user.role}</span>
        </div>
        <nav className="sidebar-nav" aria-label="Điều hướng dashboard">
          {NAV_ITEMS.map(section => {
            const visible = section.items.filter(
              item => !item.roles || item.roles.includes(user.role)
            );
            if (visible.length === 0) return null;
            return (
              <div key={section.section} className="nav-section">
                <div className="nav-section-title">{section.section}</div>
                {visible.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${pathname === item.href ? "active" : ""}`}
                  >
                    <span className="icon">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            {user.fullName}
          </div>
          <button className="btn btn-ghost btn-sm btn-full" onClick={() => void logout()}>
            🚪 Đăng xuất
          </button>
        </div>
      </aside>
      <main id="main-content" className="main-content">
        {children}
      </main>
    </div>
  );
}
