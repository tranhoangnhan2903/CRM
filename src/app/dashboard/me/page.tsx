"use client";

import { useEffect, useState } from "react";

interface MyData {
  totalCommissions: number;
  commissionCount: number;
  paidCommissions: number;
  pendingCommissions: { amount: number; count: number };
  totalExecutedRevenue: number;
  completedOrders: number;
  payoutRequestSummary: { amount: number; count: number };
  revenueByStage: Array<{ stageNo: number; revenue: number; orders: number }>;
  recentExecutedOrders: Array<{
    id: string;
    serviceName: string;
    billId: string;
    stageNo: number;
    departmentName: string;
    revenue: number;
    payoutRequestStatus: string;
    completedAt: string;
  }>;
  recentCommissions: Array<{
    id: string;
    type: string;
    amount: number;
    status: string;
    payoutMonth: string;
    bill?: { customer?: { fullName: string } };
    order?: { service?: { name: string; departmentName?: string } };
    fromDepartmentName?: string | null;
    toDepartmentName?: string | null;
  }>;
  myReferrals: Array<{
    id: string;
    status: string;
    referredCustomer: { fullName: string; phone: string };
    createdAt: string;
  }>;
}

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "badge-success",
    APPROVED: "badge-info",
    PENDING_APPROVAL: "badge-warning",
    CANCELLED: "badge-danger",
    DRAFT: "badge-default",
    SUCCESS: "badge-success",
    PENDING: "badge-warning",
    REJECTED: "badge-danger",
    NONE: "badge-default",
  };

  return <span className={`badge ${map[status] || "badge-default"}`}>{status}</span>;
}

function commissionTypeLabel(type: string) {
  if (type === "REFERRAL") return { className: "badge-info", label: "Giới thiệu khách" };
  if (type === "EXECUTOR") return { className: "badge-success", label: "Thực hiện" };
  if (type === "INDICATION") return { className: "badge-warning", label: "Chỉ định" };
  if (type === "STAGE_REFERRAL") return { className: "badge-info", label: "Giới thiệu khoa" };
  return { className: "badge-default", label: type };
}

export default function MyDashboardPage() {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/me", { credentials: "include" })
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          setData(result.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <div className="top-header">
          <div className="page-title">Dashboard cá nhân</div>
        </div>
        <div className="page-content">
          <div className="loading-shimmer" style={{ height: 220 }} />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <div className="page-content">
        <div className="alert alert-error">Không thể tải dữ liệu cá nhân</div>
      </div>
    );
  }

  return (
    <>
      <div className="top-header">
        <h1>👤 Dashboard cá nhân</h1>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon cyan">📈</div>
            <div className="stat-value">{formatVND(data.totalExecutedRevenue)}</div>
            <div className="stat-label">Doanh thu bác sĩ đã thực hiện</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">✅</div>
            <div className="stat-value">{data.completedOrders}</div>
            <div className="stat-label">Dịch vụ đã hoàn thành</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon amber">📨</div>
            <div className="stat-value">{formatVND(data.payoutRequestSummary.amount)}</div>
            <div className="stat-label">Đã gửi thanh toán ({data.payoutRequestSummary.count})</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">💰</div>
            <div className="stat-value">{formatVND(data.totalCommissions)}</div>
            <div className="stat-label">Tổng hoa hồng của tôi</div>
          </div>
        </div>

        <div className="data-table-container" style={{ marginBottom: 20 }}>
          <div className="data-table-header">
            <h3>📌 Thanh toán của bác sĩ</h3>
          </div>
          <div style={{ padding: "18px 24px", color: "var(--text-secondary)" }}>
            Bác sĩ kiểm tra doanh thu theo ngày ở màn <strong style={{ color: "var(--text-primary)" }}>Hóa đơn</strong>, sau đó bấm
            {" "}
            <strong style={{ color: "var(--text-primary)" }}>Gửi thanh toán</strong>
            {" "}
            để chuyển đề nghị sang kế toán đối soát và approve tính lương.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="data-table-container">
            <div className="data-table-header">
              <h3>🧾 Doanh thu gần đây</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dịch vụ</th>
                  <th>Khoa</th>
                  <th>Doanh thu</th>
                  <th>Thanh toán</th>
                  <th>Ngày</th>
                </tr>
              </thead>
              <tbody>
                {data.recentExecutedOrders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ color: "var(--text-primary)" }}>{order.serviceName}</td>
                    <td>{order.departmentName}</td>
                    <td>{formatVND(order.revenue)}</td>
                    <td>{statusBadge(order.payoutRequestStatus)}</td>
                    <td>{new Date(order.completedAt).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
                {data.recentExecutedOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                      Chưa có dịch vụ hoàn thành
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="data-table-container">
            <div className="data-table-header">
              <h3>💰 Hoa hồng gần đây</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loại</th>
                  <th>Khách/DV</th>
                  <th>Số tiền</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCommissions.map((commission) => (
                  <tr key={commission.id}>
                    <td>
                      <span className={`badge ${commissionTypeLabel(commission.type).className}`}>
                        {commissionTypeLabel(commission.type).label}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-primary)" }}>
                      {commission.type === "STAGE_REFERRAL"
                        ? `${commission.fromDepartmentName || "Chưa rõ khoa"} -> ${commission.toDepartmentName || "Chưa rõ khoa"}`
                        : `${commission.order?.service?.name || commission.bill?.customer?.fullName || "—"} · ${commission.order?.service?.departmentName || commission.fromDepartmentName || "Chưa rõ khoa"}`}
                    </td>
                    <td>{formatVND(commission.amount)}</td>
                    <td>{statusBadge(commission.status)}</td>
                  </tr>
                ))}
                {data.recentCommissions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                      Chưa có hoa hồng
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
