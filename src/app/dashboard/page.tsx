"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DashboardData {
  viewerRole: string;
  totalRevenue: number;
  totalCommissions: number;
  pendingCommissions: { amount: number; count: number };
  customerCount: number;
  leadStats: Array<{ status: string; _count: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  commissionByMonth: Array<{ payoutMonth: string; _sum: { amount: number | null }; _count: number }>;
  departmentSummary: Array<{
    departmentLabel: string;
    billCount: number;
    revenue: number;
    payoutRequestedAmount: number;
    payoutPaidAmount: number;
    requestCount: number;
  }>;
  payoutQueue: Array<{
    doctorId: string;
    doctorName: string;
    totalCommissionAmount: number;
    requestedCount: number;
  }>;
  doctorLeaderboard: Array<{
    doctorName: string;
    revenue: number;
    completedOrders: number;
  }>;
}

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard", { credentials: "include" })
      .then(async (response) => {
        const result = await response.json();
        if (response.status === 403) {
          router.replace("/dashboard/me");
          return null;
        }
        return result;
      })
      .then((result) => {
        if (result?.success) {
          setData(result.data);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <>
        <div className="top-header">
          <div className="page-title">Dashboard điều hành</div>
        </div>
        <div className="page-content">
          <div className="stats-grid">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="stat-card">
                <div className="loading-shimmer" style={{ height: 96 }} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <div className="page-content">
        <div className="alert alert-error">Không thể tải dữ liệu dashboard</div>
      </div>
    );
  }

  return (
    <>
      <div className="top-header">
        <h1>📊 Dashboard điều hành</h1>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon cyan">💰</div>
            <div className="stat-value">{formatVND(data.totalRevenue)}</div>
            <div className="stat-label">Tổng doanh thu đã thu</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">🧮</div>
            <div className="stat-value">{formatVND(data.totalCommissions)}</div>
            <div className="stat-label">Tổng hoa hồng toàn hệ thống</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon amber">📨</div>
            <div className="stat-value">{formatVND(data.departmentSummary.reduce((sum, dept) => sum + dept.payoutRequestedAmount, 0))}</div>
            <div className="stat-label">Đang chờ kế toán chi trả</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">👥</div>
            <div className="stat-value">{data.customerCount}</div>
            <div className="stat-label">Khách hàng đang quản lý</div>
          </div>
        </div>

        <div className="data-table-container" style={{ marginBottom: 20 }}>
          <div className="data-table-header">
            <h3>🔄 Tổng quan theo khoa</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Khoa</th>
                <th>Số bill</th>
                <th>Doanh thu</th>
                <th>Đã gửi thanh toán</th>
                <th>Đã chi trả</th>
                <th>Yêu cầu</th>
              </tr>
            </thead>
            <tbody>
              {data.departmentSummary.map((dept) => (
                <tr key={dept.departmentLabel}>
                  <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{dept.departmentLabel}</td>
                  <td>{dept.billCount}</td>
                  <td>{formatVND(dept.revenue)}</td>
                  <td>{formatVND(dept.payoutRequestedAmount)}</td>
                  <td>{formatVND(dept.payoutPaidAmount)}</td>
                  <td>
                    <span className="badge badge-info">{dept.requestCount} bill chờ chi</span>
                  </td>
                </tr>
              ))}
              {data.departmentSummary.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                    Chưa có dữ liệu khoa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20 }}>
          <div className="data-table-container">
            <div className="data-table-header">
              <h3>🧾 Hàng chờ kế toán xử lý</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bác sĩ request</th>
                  <th>Tổng hoa hồng phải chi</th>
                </tr>
              </thead>
              <tbody>
                {data.payoutQueue.map((item) => (
                  <tr key={item.doctorId}>
                    <td style={{ color: "var(--text-primary)" }}>{item.doctorName}</td>
                    <td>
                      <div>{formatVND(item.totalCommissionAmount)}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {item.requestedCount} khoản đang chờ đối soát
                      </div>
                    </td>
                  </tr>
                ))}
                {data.payoutQueue.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                      Chưa có bác sĩ nào gửi thanh toán
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="data-table-container">
            <div className="data-table-header">
              <h3>👨‍⚕️ Doanh thu bác sĩ</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bác sĩ</th>
                  <th>Doanh thu</th>
                  <th>Ca hoàn thành</th>
                </tr>
              </thead>
              <tbody>
                {data.doctorLeaderboard.map((doctor) => (
                  <tr key={doctor.doctorName}>
                    <td style={{ color: "var(--text-primary)" }}>{doctor.doctorName}</td>
                    <td>{formatVND(doctor.revenue)}</td>
                    <td>{doctor.completedOrders}</td>
                  </tr>
                ))}
                {data.doctorLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                      Chưa có doanh thu bác sĩ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
          <div className="data-table-container">
            <div className="data-table-header">
              <h3>🏆 Dịch vụ phổ biến</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dịch vụ</th>
                  <th>Lượt</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {data.topServices.map((service) => (
                  <tr key={service.name}>
                    <td style={{ color: "var(--text-primary)" }}>{service.name}</td>
                    <td>{service.count}</td>
                    <td>{formatVND(service.revenue)}</td>
                  </tr>
                ))}
                {data.topServices.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                      Chưa có dữ liệu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="data-table-container">
            <div className="data-table-header">
              <h3>📅 Hoa hồng theo tháng</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tháng</th>
                  <th>Số lượng</th>
                  <th>Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {data.commissionByMonth.map((month) => (
                  <tr key={month.payoutMonth}>
                    <td style={{ color: "var(--text-primary)" }}>{month.payoutMonth}</td>
                    <td>{month._count}</td>
                    <td>{formatVND(month._sum.amount || 0)}</td>
                  </tr>
                ))}
                {data.commissionByMonth.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center" style={{ padding: 32, color: "var(--text-muted)" }}>
                      Chưa có dữ liệu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {data.viewerRole !== "ACCOUNTANT" && (
          <div className="data-table-container" style={{ marginTop: 20 }}>
            <div className="data-table-header">
              <h3>🎯 Leads theo trạng thái</h3>
            </div>
            <div style={{ padding: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {data.leadStats.map((lead) => (
                <div key={lead.status} className="stat-card" style={{ flex: "1 1 180px" }}>
                  <div className="stat-value">{lead._count}</div>
                  <div className="stat-label">{lead.status}</div>
                </div>
              ))}
              {data.leadStats.length === 0 && (
                <div style={{ color: "var(--text-muted)" }}>Chưa có leads</div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
