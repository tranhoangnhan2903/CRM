"use client";

import { useCallback, useEffect, useState } from "react";

interface HealthPackage {
  id: string;
  code: string;
  name: string;
  subtype: string | null;
  price: number | null;
  source: string;
  syncedAt: string | null;
}

function formatVND(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<HealthPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/packages")
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          setPackages(result.data);
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

  const filtered = search
    ? packages.filter((item) => (
      item.name.toLowerCase().includes(search.toLowerCase()) || item.code.toLowerCase().includes(search.toLowerCase())
    ))
    : packages;

  return (
    <>
      <div className="top-header">
        <h1>📦 Gói khám</h1>
      </div>
      <div className="page-content">
        <div className="data-table-container">
          <div className="data-table-header">
            <input
              className="form-input"
              style={{ maxWidth: 320 }}
              placeholder="🔍 Tìm theo mã hoặc tên gói..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Tìm gói khám"
            />
            <span className="badge badge-info">{filtered.length} gói</span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Mã gói</th>
                <th>Tên gói</th>
                <th>Phân loại</th>
                <th>Giá</th>
                <th>Nguồn</th>
                <th>Lần sync cuối</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}><div className="loading-shimmer" /></td>
                </tr>
              )}
              {!loading && filtered.map((item) => (
                <tr key={item.id}>
                  <td><span className="badge badge-default">{item.code}</span></td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.name}</td>
                  <td>{item.subtype || "—"}</td>
                  <td>{formatVND(item.price)}</td>
                  <td><span className="badge badge-info">{item.source}</span></td>
                  <td>{item.syncedAt ? new Date(item.syncedAt).toLocaleString("vi-VN") : "—"}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center" style={{ padding: 40, color: "var(--text-muted)" }}>
                    Chưa có gói khám nào được đồng bộ
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
