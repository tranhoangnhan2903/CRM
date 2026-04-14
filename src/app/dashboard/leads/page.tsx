"use client";
import { useCallback, useEffect, useState } from "react";

interface Lead { id: string; customerId: string; source: string; status: string; notes: string | null; customer: { fullName: string; phone: string }; createdAt: string; }
interface Customer { id: string; fullName: string; phone: string; }

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const SOURCES = ["Facebook", "Website", "Zalo", "Referral", "Walk-in", "Phone", "Other"];
const EMPTY = { customerId: "", source: "Walk-in", status: "NEW", notes: "" };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/leads").then(r => r.json()),
      fetch("/api/customers").then(r => r.json()),
    ]).then(([lRes, cRes]) => {
      if (lRes.success) setLeads(lRes.data);
      if (cRes.success) setCustomers(cRes.data);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(""); setShowModal(true); };
  const openEdit = (l: Lead) => {
    setEditId(l.id); setForm({ customerId: l.customerId, source: l.source, status: l.status, notes: l.notes || "" });
    setError(""); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const payload: Record<string, unknown> = { ...form, notes: form.notes || null };
    if (editId) payload.id = editId;
    const res = await fetch("/api/leads", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }
    setShowModal(false); load();
  };

  const quickStatus = async (id: string, status: string) => {
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa lead này?")) return;
    await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
    load();
  };

  const filtered = filterStatus ? leads.filter(l => l.status === filterStatus) : leads;
  const statusCounts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: leads.filter(l => l.status === s).length }), {} as Record<string, number>);

  return (
    <>
      <div className="top-header"><h1>🎯 Leads</h1><button className="btn btn-primary" onClick={openCreate}>+ Thêm lead</button></div>
      <div className="page-content">
        {/* Status filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button className={`btn btn-sm ${!filterStatus ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilterStatus("")}>Tất cả ({leads.length})</button>
          {STATUSES.map(s => (
            <button key={s} className={`btn btn-sm ${filterStatus === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilterStatus(s)}>
              {s} ({statusCounts[s] || 0})
            </button>
          ))}
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead><tr><th>Khách hàng</th><th>Nguồn</th><th>Trạng thái</th><th>Ghi chú</th><th>Ngày tạo</th><th style={{ width: 180 }}>Hành động</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="loading-shimmer"></div></td></tr>}
              {!loading && filtered.map(l => (
                <tr key={l.id}>
                  <td>
                    <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{l.customer.fullName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.customer.phone}</div>
                  </td>
                  <td>{l.source}</td>
                  <td>
                    <select className="form-input" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }} value={l.status} onChange={e => quickStatus(l.id, e.target.value)} aria-label={`Cập nhật trạng thái lead ${l.customer.fullName}`}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.notes || "—"}</td>
                  <td>{new Date(l.createdAt).toLocaleDateString("vi")}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(l)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(l.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Không có lead</td></tr>}
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
          aria-label="Đóng hộp thoại lead"
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={editId ? "Sửa lead" : "Thêm lead"} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <h2>{editId ? "✏️ Sửa lead" : "➕ Thêm lead"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Khách hàng *</label>
                <select className="form-input" aria-label="Khách hàng của lead" value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} required>
                  <option value="">Chọn khách hàng</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.fullName} — {c.phone}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Nguồn</label>
                  <select className="form-input" aria-label="Nguồn lead" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Trạng thái</label>
                  <select className="form-input" aria-label="Trạng thái lead" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Ghi chú</label><textarea className="form-input" aria-label="Ghi chú lead" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
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
