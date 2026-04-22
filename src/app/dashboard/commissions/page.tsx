"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
}

function statusBadge(s: string) {
  const m: Record<string, string> = {
    PAID: "badge-success", APPROVED: "badge-info", PENDING_APPROVAL: "badge-warning",
    CANCELLED: "badge-danger", DRAFT: "badge-default",
  };
  return <span className={`badge ${m[s] || "badge-default"}`}>{s}</span>;
}

interface Commission {
  id: string;
  type: string;
  amount: number;
  status: string;
  payoutMonth: string;
  bill?: { customer?: { fullName: string } };
  order?: { service?: { name: string } };
  workflows: Array<{ status: string; comments: string | null; createdAt: string }>;
  createdAt: string;
}

function commissionTypeLabel(type: string) {
  if (type === "REFERRAL") return { className: "badge-info", label: "Giới thiệu khách" };
  if (type === "EXECUTOR") return { className: "badge-success", label: "Thực hiện" };
  if (type === "INDICATION") return { className: "badge-warning", label: "Chỉ định" };
  if (type === "STAGE_REFERRAL") return { className: "badge-info", label: "Giới thiệu khoa" };
  return { className: "badge-default", label: type };
}

export default function CommissionsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const isAdmin = user?.role === "ADMIN" || user?.role === "ACCOUNTANT";

  const load = useCallback(() => {
    if (!user) {
      setCommissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams();
    if (monthFilter) params.set("month", monthFilter);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/commissions?${params}`)
      .then(r => r.json())
      .then(res => { if (res.success) setCommissions(res.data); })
      .finally(() => setLoading(false));
  }, [monthFilter, statusFilter, user]);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load, sessionLoading]);

  const doAction = async (id: string, action: string) => {
    await fetch("/api/commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    load();
  };

  const totalAmount = commissions.reduce((s, c) => s + (c.status !== "CANCELLED" ? c.amount : 0), 0);

  return (
    <>
      <div className="top-header"><h1>💰 Hoa hồng</h1></div>
      <div className="page-content">
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="stat-card">
            <div className="stat-icon green">💰</div>
            <div className="stat-value">{formatVND(totalAmount)}</div>
            <div className="stat-label">Tổng ({commissions.filter(c => c.status !== "CANCELLED").length} giao dịch)</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon amber">⏳</div>
            <div className="stat-value">{commissions.filter(c => c.status === "PENDING_APPROVAL").length}</div>
            <div className="stat-label">Chờ duyệt</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">✅</div>
            <div className="stat-value">{commissions.filter(c => c.status === "PAID").length}</div>
            <div className="stat-label">Đã thanh toán</div>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <input type="month" className="form-input" style={{ width: 200 }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)} aria-label="Lọc hoa hồng theo tháng" />
          <select className="form-input" style={{ width: 200 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Lọc hoa hồng theo trạng thái">
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING_APPROVAL">Chờ duyệt</option>
            <option value="APPROVED">Đã duyệt</option>
            <option value="PAID">Đã trả</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr><th>Loại</th><th>Khách/DV</th><th>Số tiền</th><th>Tháng</th><th>Trạng thái</th><th>Ngày tạo</th>{isAdmin && <th>Hành động</th>}</tr>
            </thead>
            <tbody>
              {(loading || sessionLoading) && <tr><td colSpan={7}><div className="loading-shimmer"></div></td></tr>}
              {!loading && !sessionLoading && commissions.map(c => (
                <tr key={c.id}>
                  <td><span className={`badge ${commissionTypeLabel(c.type).className}`}>{commissionTypeLabel(c.type).label}</span></td>
                  <td style={{ color: "var(--text-primary)" }}>{c.bill?.customer?.fullName || c.order?.service?.name || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{formatVND(c.amount)}</td>
                  <td>{c.payoutMonth}</td>
                  <td>{statusBadge(c.status)}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString("vi")}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex gap-2">
                        {c.status === "PENDING_APPROVAL" && <>
                          <button className="btn btn-sm btn-success" onClick={() => doAction(c.id, "APPROVE")}>Duyệt</button>
                          <button className="btn btn-sm btn-danger" onClick={() => doAction(c.id, "REJECT")}>Từ chối</button>
                        </>}
                        {c.status === "APPROVED" && <button className="btn btn-sm btn-primary" onClick={() => doAction(c.id, "PAY")}>Chi trả</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && !sessionLoading && commissions.length === 0 && <tr><td colSpan={7} className="text-center" style={{ padding: 40, color: "var(--text-muted)" }}>Chưa có hoa hồng</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
