"use client";
import { useCallback, useEffect, useState } from "react";

function formatVND(n: number) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n); }

interface Service { id: string; code: string; name: string; description: string | null; price: number; departmentId: string | null; department: { name: string } | null; }
interface Dept { id: string; name: string; }

const EMPTY = { code: "", name: "", description: "", price: "", departmentId: "" };

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/departments").then(r => r.json()),
    ]).then(([sRes, dRes]) => {
      if (sRes.success) setServices(sRes.data);
      if (dRes.success) setDepts(dRes.data);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(""); setShowModal(true); };
  const openEdit = (s: Service) => {
    setEditId(s.id);
    setForm({ code: s.code, name: s.name, description: s.description || "", price: String(s.price), departmentId: s.departmentId || "" });
    setError(""); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const payload: Record<string, unknown> = { code: form.code, name: form.name, description: form.description || null, price: parseFloat(form.price), departmentId: form.departmentId || null };
    if (editId) payload.id = editId;
    const res = await fetch("/api/services", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }
    setShowModal(false); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa dịch vụ này?")) return;
    await fetch(`/api/services?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <>
      <div className="top-header"><h1>💊 Dịch vụ</h1><button className="btn btn-primary" onClick={openCreate}>+ Thêm dịch vụ</button></div>
      <div className="page-content">
        <div className="data-table-container">
          <table className="data-table">
            <thead><tr><th>Mã</th><th>Tên dịch vụ</th><th>Giá</th><th>Khoa</th><th style={{ width: 130 }}>Hành động</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="loading-shimmer"></div></td></tr>}
              {!loading && services.map(s => (
                <tr key={s.id}>
                  <td><span className="badge badge-default">{s.code}</span></td>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{s.name}</td>
                  <td style={{ fontWeight: 600 }}>{formatVND(s.price)}</td>
                  <td>{s.department?.name || "—"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(s)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && services.length === 0 && <tr><td colSpan={5} className="text-center" style={{ padding: 40, color: "var(--text-muted)" }}>Chưa có dịch vụ</td></tr>}
            </tbody>
          </table>
        </div>
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
          aria-label="Đóng hộp thoại dịch vụ"
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={editId ? "Sửa dịch vụ" : "Thêm dịch vụ"} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <h2>{editId ? "✏️ Sửa dịch vụ" : "➕ Thêm dịch vụ"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
                <div className="form-group"><label>Mã *</label><input className="form-input" aria-label="Mã dịch vụ" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required placeholder="VD: DV001" /></div>
                <div className="form-group"><label>Tên dịch vụ *</label><input className="form-input" aria-label="Tên dịch vụ" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="VD: Khám tổng quát" /></div>
              </div>
              <div className="form-group"><label>Mô tả</label><input className="form-input" aria-label="Mô tả dịch vụ" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group"><label>Giá (VND) *</label><input className="form-input" aria-label="Giá dịch vụ" type="number" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required /></div>
                <div className="form-group">
                  <label>Khoa</label>
                  <select className="form-input" aria-label="Khoa của dịch vụ" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">Không thuộc khoa</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
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
