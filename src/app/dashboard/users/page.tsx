"use client";
import { useCallback, useEffect, useState } from "react";

interface UserItem { id: string; email: string; fullName: string; role: string; roleId: string; department: string | null; departmentId: string | null; }
interface RoleOption { id: string; name: string; }
interface DeptOption { id: string; name: string; }

const EMPTY = { fullName: "", email: "", password: "", roleId: "", departmentId: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [depts, setDepts] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/users").then(r => r.json()),
      fetch("/api/roles").then(r => r.json()),
      fetch("/api/departments").then(r => r.json()),
    ]).then(([uRes, rRes, dRes]) => {
      if (uRes.success) setUsers(uRes.data);
      if (rRes.success) setRoles(rRes.data);
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
  const openEdit = (u: UserItem) => {
    setEditId(u.id);
    setForm({ fullName: u.fullName, email: u.email, password: "", roleId: u.roleId, departmentId: u.departmentId || "" });
    setError(""); setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const payload: Record<string, unknown> = {
      fullName: form.fullName, email: form.email, roleId: form.roleId, departmentId: form.departmentId || null,
    };
    if (form.password) payload.password = form.password;
    if (editId) payload.id = editId;
    else if (!form.password) { setError("Mật khẩu bắt buộc khi tạo mới"); return; }

    const res = await fetch("/api/users", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }
    setShowModal(false); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa người dùng này?")) return;
    const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) alert(data.error);
    load();
  };

  const roleColor = (r: string) => {
    const map: Record<string, string> = { ADMIN: "info", DOCTOR: "info", RECEPTIONIST: "success", ACCOUNTANT: "amber", SALES: "green" };
    return map[r] || "default";
  };

  return (
    <>
      <div className="top-header"><h1>🔑 Người dùng</h1><button className="btn btn-primary" onClick={openCreate}>+ Thêm người dùng</button></div>
      <div className="page-content">
        <div className="data-table-container">
          <table className="data-table">
            <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Khoa</th><th style={{ width: 130 }}>Hành động</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="loading-shimmer"></div></td></tr>}
              {!loading && users.map(u => (
                <tr key={u.id}>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge badge-${roleColor(u.role)}`}>{u.role}</span></td>
                  <td>{u.department || "—"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(u)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Chưa có người dùng</td></tr>}
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
          aria-label="Đóng hộp thoại người dùng"
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={editId ? "Sửa người dùng" : "Thêm người dùng"} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <h2>{editId ? "✏️ Sửa người dùng" : "➕ Thêm người dùng"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Họ tên *</label><input className="form-input" aria-label="Họ tên người dùng" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></div>
              <div className="form-group"><label>Email *</label><input className="form-input" aria-label="Email người dùng" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="form-group">
                <label>{editId ? "Mật khẩu (để trống = giữ nguyên)" : "Mật khẩu *"}</label>
                <input className="form-input" aria-label="Mật khẩu người dùng" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editId ? "Không thay đổi" : "Nhập mật khẩu"} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Vai trò *</label>
                  <select className="form-input" aria-label="Vai trò người dùng" value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })} required>
                    <option value="">Chọn vai trò</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Khoa</label>
                  <select className="form-input" aria-label="Khoa của người dùng" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
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
