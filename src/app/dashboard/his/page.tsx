"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface OverviewData {
  config: {
    configured: boolean;
    missingKeys: string[];
  };
  counts: {
    customers: number;
    doctors: number;
    services: number;
    packages: number;
    bills: number;
  };
  latestEvents: Array<{
    id: string;
    eventType: string;
    status: string;
    message: string | null;
    createdAt: string;
  }>;
}

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_FROM = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function HisDashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(DEFAULT_FROM);
  const [toDate, setToDate] = useState(TODAY);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/his/overview")
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          setOverview(result.data);
        } else {
          setMessage(result.error || "Khong the tai trang thai dong bo DW");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const actions = useMemo(() => ([
    { key: "all", label: "Dong bo tat ca master tu DW", payload: { target: "all" } },
    { key: "doctors", label: "Dong bo bac si tu DW", payload: { target: "doctors" } },
    { key: "services", label: "Dong bo dich vu tu DW", payload: { target: "services" } },
    { key: "packages", label: "Dong bo goi kham", payload: { target: "packages" } },
  ]), []);

  const runSync = async (key: string, payload: Record<string, unknown>) => {
    setBusyKey(key);
    setMessage("");
    try {
      const response = await fetch("/api/his/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) {
        setMessage(result.error || "Dong bo that bai");
        return;
      }

      setMessage(`Dong bo thanh cong: ${JSON.stringify(result.data)}`);
      load();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <div className="top-header">
        <h1>🔄 Dong bo DW / HIS</h1>
      </div>
      <div className="page-content">
        {message && (
          <div className={message.includes("thanh cong") ? "alert alert-success" : "alert alert-error"} style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        {overview && !overview.config.configured && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            Thieu cau hinh DW: {overview.config.missingKeys.join(", ")}
          </div>
        )}

        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-icon cyan">👥</div><div className="stat-value">{overview?.counts.customers || 0}</div><div className="stat-label">Khach tu DW</div></div>
          <div className="stat-card"><div className="stat-icon green">👨‍⚕️</div><div className="stat-value">{overview?.counts.doctors || 0}</div><div className="stat-label">Nhan su tu DW</div></div>
          <div className="stat-card"><div className="stat-icon amber">💊</div><div className="stat-value">{overview?.counts.services || 0}</div><div className="stat-label">Dich vu tu DW</div></div>
          <div className="stat-card"><div className="stat-icon cyan">📦</div><div className="stat-value">{overview?.counts.packages || 0}</div><div className="stat-label">Goi kham local/HIS</div></div>
        </div>

        <div className="data-table-container" style={{ marginBottom: 20 }}>
          <div className="data-table-header">
            <h3>Dong bo master data</h3>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {actions.map((action) => (
              <button
                key={action.key}
                className="btn btn-primary"
                onClick={() => runSync(action.key, action.payload)}
                disabled={busyKey !== null}
              >
                {busyKey === action.key ? "Dang chay..." : action.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div className="form-group" style={{ minWidth: 260 }}>
              <label>Tim 1 khach tu DW</label>
              <input
                className="form-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ten, ma khach, so dien thoai..."
                aria-label="Tim mot khach hang tu DW"
              />
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => runSync("customers", { target: "customers", search })}
              disabled={busyKey !== null}
            >
              {busyKey === "customers" ? "Dang chay..." : "Dong bo khach theo tim kiem"}
            </button>
          </div>
          <div style={{ color: "var(--text-secondary)", marginTop: 12 }}>
            Master data chinh doc tu Data Warehouse. Rieng goi kham hien fallback qua HIS neu co cau hinh.
          </div>
        </div>

        <div className="data-table-container" style={{ marginBottom: 20 }}>
          <div className="data-table-header">
            <h3>Dong bo stage va dich vu kham tu DW</h3>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div className="form-group">
              <label>Tu ngay</label>
              <input className="form-input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Tu ngay sync DW" />
            </div>
            <div className="form-group">
              <label>Den ngay</label>
              <input className="form-input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Den ngay sync DW" />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => runSync("exams", { target: "exams", fromDate, toDate })}
              disabled={busyKey !== null}
            >
              {busyKey === "exams" ? "Dang chay..." : "Dong bo luong phan khoa"}
            </button>
          </div>
          <div style={{ color: "var(--text-secondary)", marginTop: 12 }}>
            Luong nay doc cac ban ghi `SOHID/SOLID` tu DW va map vao bill, stage, dich vu trong CRM.
          </div>
        </div>

        <div className="data-table-container">
          <div className="data-table-header">
            <h3>Su kien dong bo gan day</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Su kien</th>
                <th>Trang thai</th>
                <th>Thong diep</th>
                <th>Thoi gian</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4}><div className="loading-shimmer" /></td>
                </tr>
              )}
              {!loading && overview?.latestEvents.map((event) => (
                <tr key={event.id}>
                  <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{event.eventType}</td>
                  <td><span className={`badge ${event.status === "SUCCESS" ? "badge-success" : event.status === "FAILED" ? "badge-danger" : "badge-warning"}`}>{event.status}</span></td>
                  <td>{event.message || "—"}</td>
                  <td>{new Date(event.createdAt).toLocaleString("vi-VN")}</td>
                </tr>
              ))}
              {!loading && (!overview || overview.latestEvents.length === 0) && (
                <tr>
                  <td colSpan={4} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                    Chua co su kien dong bo nao
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
