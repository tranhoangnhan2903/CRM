"use client";

import { useCallback, useEffect, useState } from "react";

interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string | null;
  yearOfBirth: number | null;
  gender: string | null;
  _count: { bills: number; appointments: number };
}

const EMPTY = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  yearOfBirth: "",
  gender: "",
};

function genderLabel(gender: string | null) {
  if (gender === "MALE") return "Nam";
  if (gender === "FEMALE") return "Nữ";
  return "—";
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "10",
    });
    if (search.trim()) {
      params.set("q", search.trim());
    }

    fetch(`/api/customers?${params}`)
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          setCustomers(result.data);
          if (result.meta?.pagination) {
            setPagination(result.meta.pagination);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setError("");
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditId(customer.id);
    setForm({
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email || "",
      address: customer.address || "",
      yearOfBirth: customer.yearOfBirth ? String(customer.yearOfBirth) : "",
      gender: customer.gender || "",
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const payload: Record<string, unknown> = {
      fullName: form.fullName,
      phone: form.phone,
      email: form.email || null,
      address: form.address || null,
      yearOfBirth: form.yearOfBirth || null,
      gender: form.gender || null,
    };

    if (editId) {
      payload.id = editId;
    }

    const response = await fetch("/api/customers", {
      method: editId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error);
      return;
    }

    setShowModal(false);
    void load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa khách hàng này? Thao tác không thể hoàn tác.")) {
      return;
    }

    await fetch(`/api/customers?id=${id}`, {
      method: "DELETE",
    });
    void load();
  };

  return (
    <>
      <div className="top-header">
        <h1>👥 Khách hàng</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm khách hàng</button>
      </div>
      <div className="page-content">
        <div className="data-table-container">
          <div className="data-table-header">
            <input
              className="form-input"
              style={{ maxWidth: 300 }}
              placeholder="🔍 Tìm theo tên, SĐT..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Tìm khách hàng theo tên hoặc số điện thoại"
            />
            <span className="badge badge-info">{pagination.total} khách hàng</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>SĐT</th>
                <th>Năm sinh</th>
                <th>Giới tính</th>
                <th>Email</th>
                <th>Hóa đơn</th>
                <th style={{ width: 130 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7}><div className="loading-shimmer" /></td>
                </tr>
              )}
              {!loading && customers.map((customer) => (
                <tr key={customer.id}>
                  <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{customer.fullName}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.yearOfBirth || "—"}</td>
                  <td>{genderLabel(customer.gender)}</td>
                  <td>{customer.email || "—"}</td>
                  <td><span className="badge badge-info">{customer._count.bills}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(customer)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(customer.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                    Không tìm thấy khách hàng
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="data-table-header" style={{ borderTop: "1px solid var(--border-color)" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              Trang {pagination.page}/{pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-ghost" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Trang trước
              </button>
              <button
                className="btn btn-sm btn-ghost"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              >
                Trang sau
              </button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setShowModal(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Đóng hộp thoại khách hàng"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={editId ? "Sửa khách hàng" : "Thêm khách hàng"}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <h2>{editId ? "✏️ Sửa khách hàng" : "➕ Thêm khách hàng"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Họ tên *</label>
                <input
                  className="form-input"
                  aria-label="Họ tên khách hàng"
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Số điện thoại *</label>
                  <input
                    className="form-input"
                    aria-label="Số điện thoại khách hàng"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-input"
                    aria-label="Email khách hàng"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Năm sinh</label>
                  <input
                    className="form-input"
                    aria-label="Năm sinh khách hàng"
                    type="number"
                    min="1900"
                    max="2100"
                    value={form.yearOfBirth}
                    onChange={(event) => setForm({ ...form, yearOfBirth: event.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Giới tính</label>
                  <select
                    className="form-input"
                    aria-label="Giới tính khách hàng"
                    value={form.gender}
                    onChange={(event) => setForm({ ...form, gender: event.target.value })}
                  >
                    <option value="">Chưa chọn</option>
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Địa chỉ</label>
                <input
                  className="form-input"
                  aria-label="Địa chỉ khách hàng"
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
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
