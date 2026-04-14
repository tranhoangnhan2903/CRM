"use client";

import { useCallback, useEffect, useState } from "react";

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
}

interface Policy {
  id: string;
  name: string;
  type: string;
  valueType: string;
  value: number;
  departmentId: string | null;
  serviceId: string | null;
  serviceName: string | null;
  serviceCode: string | null;
  departmentName: string | null;
  minBillSize: number | null;
  campaignName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface ServiceOption { id: string; code: string; name: string; departmentId: string | null; }
interface DeptOption { id: string; name: string; }

const EMPTY_FORM = {
  name: "", type: "REFERRAL", valueType: "PERCENTAGE", value: "",
  departmentId: "", serviceId: "", minBillSize: "", campaignName: "",
  effectiveFrom: new Date().toISOString().split("T")[0], effectiveTo: "",
};

interface PolicyTableProps {
  items: Policy[];
  label: string;
  color: string;
  onCreate: () => void;
  onEdit: (policy: Policy) => void;
  onDelete: (id: string) => void;
  renderValue: (policy: Policy) => string;
  renderScope: (policy: Policy) => string[];
}

function PolicyTable({
  items,
  label,
  color,
  onCreate,
  onEdit,
  onDelete,
  renderValue,
  renderScope,
}: PolicyTableProps) {
  return (
    <div className="data-table-container" style={{ marginBottom: 24 }}>
      <div className="data-table-header">
        <h3><span className={`badge badge-${color}`}>{label}</span> ({items.length} chính sách)</h3>
        <button className="btn btn-primary btn-sm" onClick={onCreate}>+ Tạo mới</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Tên</th>
            <th>Giá trị</th>
            <th>Phạm vi</th>
            <th>Hiệu lực</th>
            <th style={{ width: 130 }}>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} className="text-center" style={{ padding: 30, color: "var(--text-muted)" }}>Chưa có chính sách {label.toLowerCase()}</td></tr>
          )}
          {items.map((policy) => {
            const isActive = new Date(policy.effectiveFrom) <= new Date()
              && (!policy.effectiveTo || new Date(policy.effectiveTo) >= new Date());

            return (
              <tr key={policy.id}>
                <td>
                  <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{policy.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {policy.valueType === "PERCENTAGE" ? "Phần trăm" : "Cố định"}
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)" }}>
                    {renderValue(policy)}
                  </span>
                </td>
                <td>
                  <div className="flex flex-col gap-1">
                    {renderScope(policy).map((scope, index) => (
                      <span key={index} style={{ fontSize: 13, color: "var(--text-secondary)" }}>{scope}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 13 }}>
                    <span className={`badge ${isActive ? "badge-success" : "badge-default"}`}>
                      {isActive ? "Đang hiệu lực" : "Hết hạn"}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {new Date(policy.effectiveFrom).toLocaleDateString("vi")}
                      {policy.effectiveTo ? ` → ${new Date(policy.effectiveTo).toLocaleDateString("vi")}` : " → ∞"}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => onEdit(policy)} title="Sửa">✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(policy.id)} title="Xóa">🗑️</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/commission-policies").then(r => r.json()),
      fetch("/api/services").then(r => r.json()),
      fetch("/api/departments").then(r => r.json()),
    ]).then(([polRes, svcRes, deptRes]) => {
      if (polRes.success) setPolicies(polRes.data);
      if (svcRes.success) setServices(svcRes.data);
      if (deptRes.success) setDepartments(deptRes.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowModal(true);
  };

  const openEdit = (p: Policy) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      valueType: p.valueType,
      value: String(p.value),
      departmentId: p.departmentId || "",
      serviceId: p.serviceId || "",
      minBillSize: p.minBillSize ? String(p.minBillSize) : "",
      campaignName: p.campaignName || "",
      effectiveFrom: p.effectiveFrom.split("T")[0],
      effectiveTo: p.effectiveTo ? p.effectiveTo.split("T")[0] : "",
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const payload: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      valueType: form.valueType,
      value: parseFloat(form.value),
      departmentId: form.departmentId || null,
      serviceId: form.serviceId || null,
      minBillSize: form.minBillSize ? parseFloat(form.minBillSize) : null,
      campaignName: form.campaignName || null,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
    };

    if (editId) payload.id = editId;

    const res = await fetch("/api/commission-policies", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }

    setShowModal(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa chính sách này? Hành động không thể hoàn tác.")) return;
    const res = await fetch(`/api/commission-policies?id=${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) load();
  };

  // Separate policy groups by business rule
  const referralPolicies = policies.filter(p => p.type === "REFERRAL");
  const executorPolicies = policies.filter(p => p.type === "EXECUTOR");
  const indicationPolicies = policies.filter(p => p.type === "INDICATION");
  const stageReferralPolicies = policies.filter(p => p.type === "STAGE_REFERRAL");

  const renderValue = (p: Policy) => {
    if (p.valueType === "PERCENTAGE") return `${p.value}%`;
    return formatVND(p.value);
  };

  const renderScope = (p: Policy) => {
    const parts: string[] = [];
    if (p.serviceName) parts.push(`📌 ${p.serviceName}`);
    else if (p.departmentName) parts.push(`🏢 ${p.departmentName}`);
    else parts.push("🌐 Toàn cục");
    if (p.minBillSize) parts.push(`≥ ${formatVND(p.minBillSize)}`);
    if (p.campaignName) parts.push(`🏷️ ${p.campaignName}`);
    return parts;
  };

  // Stats
  const activeCount = policies.filter(p => {
    const now = new Date();
    return new Date(p.effectiveFrom) <= now && (!p.effectiveTo || new Date(p.effectiveTo) >= now);
  }).length;

  return (
    <>
      <div className="top-header">
        <h1>📋 Chính sách hoa hồng</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Tạo chính sách</button>
      </div>
      <div className="page-content">
        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon cyan">📋</div>
            <div className="stat-value">{policies.length}</div>
            <div className="stat-label">Tổng chính sách</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">✅</div>
            <div className="stat-value">{activeCount}</div>
            <div className="stat-label">Đang hiệu lực</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">🤝</div>
            <div className="stat-value">{referralPolicies.length}</div>
            <div className="stat-label">Giới thiệu</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon amber">⚡</div>
            <div className="stat-value">{executorPolicies.length}</div>
            <div className="stat-label">Thực hiện</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">🧾</div>
            <div className="stat-value">{indicationPolicies.length + stageReferralPolicies.length}</div>
            <div className="stat-label">Chỉ định / Giới thiệu stage</div>
          </div>
        </div>

        {/* API info card */}
        <div className="stat-card" style={{ marginBottom: 24, borderLeft: "4px solid var(--accent-indigo)" }}>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--text-primary)" }}>🔗 API cho HIS Integration:</strong><br />
            • <code style={{ background: "rgba(8,145,178,0.2)", padding: "2px 6px", borderRadius: 4 }}>POST /api/commission-policies</code> — Tạo mới<br />
            • <code style={{ background: "rgba(8,145,178,0.2)", padding: "2px 6px", borderRadius: 4 }}>PATCH /api/commission-policies</code> — Cập nhật (gửi id + fields cần sửa)<br />
            • <code style={{ background: "rgba(8,145,178,0.2)", padding: "2px 6px", borderRadius: 4 }}>DELETE /api/commission-policies?id=xxx</code> — Xóa<br />
            • Tất cả endpoints yêu cầu session hợp lệ qua cookie đăng nhập
          </div>
        </div>

        {loading ? (
          <div className="loading-shimmer" style={{ height: 200 }}></div>
        ) : (
          <>
            <PolicyTable
              items={referralPolicies}
              label="GIỚI THIỆU KHÁCH"
              color="info"
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={handleDelete}
              renderValue={renderValue}
              renderScope={renderScope}
            />
            <PolicyTable
              items={executorPolicies}
              label="THỰC HIỆN"
              color="info"
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={handleDelete}
              renderValue={renderValue}
              renderScope={renderScope}
            />
            <PolicyTable
              items={indicationPolicies}
              label="CHỈ ĐỊNH"
              color="warning"
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={handleDelete}
              renderValue={renderValue}
              renderScope={renderScope}
            />
            <PolicyTable
              items={stageReferralPolicies}
              label="GIỚI THIỆU STAGE"
              color="success"
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={handleDelete}
              renderValue={renderValue}
              renderScope={renderScope}
            />
          </>
        )}
      </div>

      {/* Create/Edit modal */}
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
          aria-label="Đóng hộp thoại chính sách hoa hồng"
        >
          <div className="modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label={editId ? "Sửa chính sách hoa hồng" : "Tạo chính sách hoa hồng"} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <h2>{editId ? "✏️ Sửa chính sách" : "➕ Tạo chính sách hoa hồng"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tên chính sách *</label>
                <input className="form-input" aria-label="Tên chính sách hoa hồng" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="VD: Hoa hồng giới thiệu 5%" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Loại *</label>
                  <select className="form-input" aria-label="Loại chính sách hoa hồng" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="REFERRAL">🤝 Giới thiệu khách</option>
                    <option value="EXECUTOR">⚡ Thực hiện (Executor)</option>
                    <option value="INDICATION">🧾 Chỉ định trong stage</option>
                    <option value="STAGE_REFERRAL">➡️ Giới thiệu qua stage sau</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Hình thức *</label>
                  <select className="form-input" aria-label="Hình thức tính hoa hồng" value={form.valueType} onChange={e => setForm({ ...form, valueType: e.target.value })}>
                    <option value="PERCENTAGE">📊 Phần trăm (%)</option>
                    <option value="FIXED">💰 Cố định (VND)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Giá trị * {form.valueType === "PERCENTAGE" ? "(% trên tổng bill)" : "(VND cố định)"}</label>
                <input className="form-input" aria-label="Giá trị hoa hồng" type="number" step="0.01" min="0" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} required placeholder={form.valueType === "PERCENTAGE" ? "VD: 5" : "VD: 50000"} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Khoa (để trống = tất cả)</label>
                  <select className="form-input" aria-label="Khoa áp dụng chính sách" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">Tất cả khoa</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Dịch vụ (để trống = tất cả)</label>
                  <select className="form-input" aria-label="Dịch vụ áp dụng chính sách" value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })}>
                    <option value="">Tất cả dịch vụ</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Bill tối thiểu (VND)</label>
                  <input className="form-input" aria-label="Bill tối thiểu áp dụng chính sách" type="number" min="0" value={form.minBillSize} onChange={e => setForm({ ...form, minBillSize: e.target.value })} placeholder="Để trống = không giới hạn" />
                </div>
                <div className="form-group">
                  <label>Campaign</label>
                  <input className="form-input" aria-label="Tên chiến dịch" value={form.campaignName} onChange={e => setForm({ ...form, campaignName: e.target.value })} placeholder="VD: Tháng 4/2026" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Hiệu lực từ *</label>
                  <input className="form-input" aria-label="Ngày bắt đầu hiệu lực chính sách" type="date" value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Đến (trống = vô thời hạn)</label>
                  <input className="form-input" aria-label="Ngày kết thúc hiệu lực chính sách" type="date" value={form.effectiveTo} onChange={e => setForm({ ...form, effectiveTo: e.target.value })} />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editId ? "Cập nhật" : "Tạo chính sách"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
