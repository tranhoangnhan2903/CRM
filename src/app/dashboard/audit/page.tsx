"use client";
import { useCallback, useEffect, useState } from "react";

interface AuditEntry { id: string; action: string; entityType: string; entityId: string; user: { fullName: string; email: string } | null; createdAt: string; }

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/audit-logs?limit=200")
      .then(r => r.json())
      .then(res => { if (res.success) setLogs(res.data); })
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
      <div className="top-header"><h1>📜 Audit Log</h1></div>
      <div className="page-content">
        <div className="data-table-container">
          <table className="data-table">
            <thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Đối tượng</th><th>ID</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="loading-shimmer"></div></td></tr>}
              {!loading && logs.map(l => (
                <tr key={l.id}>
                  <td style={{color:"var(--text-primary)", whiteSpace:"nowrap"}}>{new Date(l.createdAt).toLocaleString("vi")}</td>
                  <td>{l.user?.fullName || "System"}</td>
                  <td><span className="badge badge-info">{l.action}</span></td>
                  <td>{l.entityType}</td>
                  <td className="font-mono truncate" style={{maxWidth:120, fontSize:12}}>{l.entityId}</td>
                </tr>
              ))}
              {!loading && logs.length === 0 && <tr><td colSpan={5} className="text-center" style={{padding:40, color:"var(--text-muted)"}}>Chưa có log</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
