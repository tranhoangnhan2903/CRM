"use client";
import { useCallback, useEffect, useState } from "react";

interface Dept {
  id: string;
  name: string;
  description: string | null;
  source?: string;
  hisCode?: string | null;
  excludeStageReferral: boolean;
  _count: { users: number; services: number };
}

export default function DepartmentsPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", excludeStageReferral: false });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/departments")
      .then(r => r.json()).then(res => { if (res.success) setDepts(res.data); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const openCreate = () => { setEditId(null); setForm({ name: "", description: "", excludeStageReferral: false }); setError(""); setShowModal(true); };
  const openEdit = (d: Dept) => {
    setEditId(d.id);
    setForm({
      name: d.name,
      description: d.description || "",
      excludeStageReferral: d.excludeStageReferral,
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description || null,
      excludeStageReferral: form.excludeStageReferral,
    };
    if (editId) payload.id = editId;
    const res = await fetch("/api/departments", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }
    setShowModal(false); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa khoa/phòng này?")) return;
    await fetch(`/api/departments?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <>
      <div className="top-header"><h1>🏢 Khoa / Phòng ban</h1><button className="btn btn-primary" onClick={openCreate}>+ Thêm khoa</button></div>
      <div className="page-content">
        <div className="stats-grid">
          {!loading && depts.map(d => (
            <div key={d.id} className="stat-card" style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEdit(d)}>✏️</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.id)}>🗑️</button>
              </div>
              <div className="stat-icon cyan">🏥</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{d.name}</div>
              <div className="stat-label">{d.description || ""}</div>
              <div className="flex gap-4 mt-4">
                <span className={`badge ${d.source === "HIS" ? "badge-info" : "badge-default"}`}>{d.source || "CRM"}</span>
                <span className="badge badge-info">{d._count.users} nhân viên</span>
                <span className="badge badge-success">{d._count.services} dịch vụ</span>
                <span className={`badge ${d.excludeStageReferral ? "badge-danger" : "badge-success"}`}>
                  {d.excludeStageReferral ? "Loại trừ giới thiệu" : "Tính giới thiệu"}
                </span>
              </div>
              {d.hisCode && <div style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 13 }}>HIS: {d.hisCode}</div>}
            </div>
          ))}
        </div>
        {!loading && depts.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Chưa có khoa/phòng</div>}
      </div>

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
          aria-label="Đóng hộp thoại khoa phòng"
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={editId ? "Sửa khoa phòng" : "Thêm khoa phòng"} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <h2>{editId ? "✏️ Sửa khoa" : "➕ Thêm khoa / phòng ban"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Tên khoa *</label><input className="form-input" aria-label="Tên khoa hoặc phòng ban" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="VD: Khoa Nội" /></div>
              <div className="form-group"><label>Mô tả</label><input className="form-input" aria-label="Mô tả khoa hoặc phòng ban" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mô tả ngắn" /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)", marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={form.excludeStageReferral}
                  onChange={(e) => setForm({ ...form, excludeStageReferral: e.target.checked })}
                />
                Loại trừ khoa này khỏi hoa hồng giới thiệu khi chuyển stage
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editId ? "Cập nhật" : "Tạo"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
