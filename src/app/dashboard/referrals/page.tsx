"use client";
import { useCallback, useEffect, useState } from "react";

interface Referral { id: string; status: string; referrer: { fullName: string; email: string }; referredCustomer: { fullName: string; phone: string }; _count: { commissions: number }; createdAt: string; }

function statusBadge(s: string) {
  const m: Record<string, string> = { SUCCESS: "badge-success", PENDING: "badge-warning", REJECTED: "badge-danger" };
  return <span className={`badge ${m[s] || "badge-default"}`}>{s}</span>;
}

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/referrals")
      .then(r => r.json())
      .then(res => { if (res.success) setReferrals(res.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  return (
    <>
      <div className="top-header"><h1>🤝 Giới thiệu</h1></div>
      <div className="page-content">
        <div className="data-table-container">
          <table className="data-table">
            <thead><tr><th>Người giới thiệu</th><th>Khách được giới thiệu</th><th>SĐT</th><th>Trạng thái</th><th>Hoa hồng</th><th>Ngày</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="loading-shimmer"></div></td></tr>}
              {!loading && referrals.map(r => (
                <tr key={r.id}>
                  <td style={{color:"var(--text-primary)", fontWeight:500}}>{r.referrer.fullName}</td>
                  <td>{r.referredCustomer.fullName}</td>
                  <td>{r.referredCustomer.phone}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td><span className="badge badge-info">{r._count.commissions}</span></td>
                  <td>{new Date(r.createdAt).toLocaleDateString("vi")}</td>
                </tr>
              ))}
              {!loading && referrals.length === 0 && <tr><td colSpan={6} className="text-center" style={{padding:40, color:"var(--text-muted)"}}>Chưa có giới thiệu</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
