"use client";

import { useCallback, useEffect, useState } from "react";

interface Tier {
  id: string;
  name: string;
  serviceId: string | null;
  departmentId: string | null;
  serviceName: string | null;
  departmentName: string | null;
  minDailyCount: number;
  percentage: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface ServiceOption {
  id: string;
  code: string;
  name: string;
}

export default function ExecutorTiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    serviceId: "",
    minDailyCount: "0",
    percentage: "",
    effectiveFrom: new Date().toISOString().split("T")[0],
  });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/executor-tiers").then(r => r.json()),
      fetch("/api/services").then(r => r.json()),
    ]).then(([tiersRes, svcsRes]) => {
      if (tiersRes.success) setTiers(tiersRes.data);
      if (svcsRes.success) setServices(svcsRes.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/executor-tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name || `Tier ${form.minDailyCount}+ khách/ngày`,
        serviceId: form.serviceId || null,
        minDailyCount: parseInt(form.minDailyCount),
        percentage: parseFloat(form.percentage),
        effectiveFrom: form.effectiveFrom,
      }),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }
    setShowModal(false);
    setForm({ name: "", serviceId: "", minDailyCount: "0", percentage: "", effectiveFrom: new Date().toISOString().split("T")[0] });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa ngưỡng này?")) return;
    await fetch(`/api/executor-tiers?id=${id}`, {
      method: "DELETE",
    });
    load();
  };

  // Group tiers by service for better visualization
  const grouped: Record<string, Tier[]> = {};
  for (const t of tiers) {
    const key = t.serviceName || "(Tất cả dịch vụ)";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }
  // Sort each group by minDailyCount
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.minDailyCount - b.minDailyCount);
  }

  return (
    <>
      <div className="top-header">
        <h1>🎯 Ngưỡng hoa hồng thực hiện</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Thêm ngưỡng</button>
      </div>
      <div className="page-content">
        {/* Explanation card */}
        <div className="stat-card" style={{ marginBottom: 24, borderLeft: "4px solid var(--accent-indigo)" }}>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--text-primary)" }}>Cách hoạt động:</strong><br />
            • Mỗi ngưỡng định nghĩa <strong>số khách tối thiểu/ngày</strong> để nhận mức hoa hồng tương ứng.<br />
            • Ví dụ: Từ 0–4 khách/ngày → 10% giá dịch vụ | Từ 5 khách trở lên → 12% giá dịch vụ.<br />
            • Hệ thống sẽ <strong>tự động đếm</strong> số dịch vụ bác sĩ hoàn thành trong ngày và lấy % cao nhất đang hiệu lực.<br />
            • Ngưỡng theo dịch vụ cụ thể được ưu tiên hơn ngưỡng toàn cục.
          </div>
        </div>

        {loading ? (
          <div className="loading-shimmer" style={{ height: 200 }}></div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="data-table-container">
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              Chưa có ngưỡng nào. Nhấn <strong>+ Thêm ngưỡng</strong> để tạo.
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([serviceName, tierList]) => (
            <div key={serviceName} className="data-table-container" style={{ marginBottom: 20 }}>
              <div className="data-table-header">
                <h3>💊 {serviceName}</h3>
                <span className="badge badge-info">{tierList.length} ngưỡng</span>
              </div>

              {/* Visual tier diagram */}
              <div style={{ padding: "16px 24px", display: "flex", gap: 0 }}>
                {tierList.map((tier, idx) => {
                  const nextMin = tierList[idx + 1]?.minDailyCount;
                  const rangeLabel = nextMin
                    ? `${tier.minDailyCount}–${nextMin - 1} khách/ngày`
                    : `${tier.minDailyCount}+ khách/ngày`;
                  const isBonus = idx > 0;
                  return (
                    <div
                      key={tier.id}
                      style={{
                        flex: 1,
                        padding: "16px 20px",
                        background: isBonus
                          ? "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(6,182,212,0.1))"
                          : "rgba(8,145,178,0.1)",
                        borderRadius: idx === 0 ? "12px 0 0 12px" : idx === tierList.length - 1 ? "0 12px 12px 0" : "0",
                        borderRight: idx < tierList.length - 1 ? "2px solid var(--border-color)" : "none",
                        position: "relative",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>
                        {isBonus ? "🏆 THƯỞNG VƯỢT NGƯỠNG" : "📋 MỨC CƠ BẢN"}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>{rangeLabel}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: isBonus ? "var(--accent-green)" : "var(--accent-indigo-light)" }}>
                        {tier.percentage}%
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>giá trị dịch vụ</div>
                    </div>
                  );
                })}
              </div>

              <table className="data-table">
                <thead>
                  <tr><th>Tên</th><th>Ngưỡng tối thiểu</th><th>Tỷ lệ hoa hồng</th><th>Hiệu lực từ</th><th>Hành động</th></tr>
                </thead>
                <tbody>
                  {tierList.map(t => (
                    <tr key={t.id}>
                      <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{t.name}</td>
                      <td>
                        <span className="badge badge-info">≥ {t.minDailyCount} khách/ngày</span>
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--accent-green)" }}>{t.percentage}% giá dịch vụ</td>
                      <td>{new Date(t.effectiveFrom).toLocaleDateString("vi")}</td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowModal(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Đóng hộp thoại ngưỡng hoa hồng"
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Thêm ngưỡng hoa hồng" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <h2>Thêm ngưỡng hoa hồng</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Tên ngưỡng</label>
                <input
                  className="form-input"
                  aria-label="Tên ngưỡng hoa hồng"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Mức cơ bản, Vượt 5 khách..."
                />
              </div>
              <div className="form-group">
                <label>Dịch vụ (để trống = tất cả)</label>
                <select className="form-input" aria-label="Dịch vụ áp dụng ngưỡng hoa hồng" value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })}>
                  <option value="">Tất cả dịch vụ</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.code} – {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Số khách tối thiểu trong ngày *</label>
                <input
                  className="form-input"
                  aria-label="Số khách tối thiểu trong ngày"
                  type="number"
                  min="0"
                  value={form.minDailyCount}
                  onChange={e => setForm({ ...form, minDailyCount: e.target.value })}
                  required
                />
                <small style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  0 = mức cơ bản (luôn áp dụng). VD: 5 = áp dụng từ khách thứ 5 trở đi.
                </small>
              </div>
              <div className="form-group">
                <label>Tỷ lệ hoa hồng trên giá dịch vụ (%) *</label>
                <input
                  className="form-input"
                  aria-label="Tỷ lệ hoa hồng theo phần trăm"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.percentage}
                  onChange={e => setForm({ ...form, percentage: e.target.value })}
                  required
                  placeholder="VD: 12.5"
                />
              </div>
              <div className="form-group">
                <label>Hiệu lực từ</label>
                <input
                  className="form-input"
                  aria-label="Ngày bắt đầu hiệu lực ngưỡng hoa hồng"
                  type="date"
                  value={form.effectiveFrom}
                  onChange={e => setForm({ ...form, effectiveFrom: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Tạo ngưỡng</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
