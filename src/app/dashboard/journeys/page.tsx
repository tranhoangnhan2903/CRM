"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type JourneySortKey =
  | "fullName"
  | "phone"
  | "yearOfBirth"
  | "gender"
  | "totalAmount"
  | "totalDoctorCommission"
  | "journeyCount";

type SortDirection = "asc" | "desc";

const SORT_LABELS: Record<JourneySortKey, string> = {
  fullName: "Khách hàng",
  phone: "Số điện thoại",
  yearOfBirth: "Năm sinh",
  gender: "Giới tính",
  totalAmount: "Tổng số tiền",
  totalDoctorCommission: "Tổng HH BS",
  journeyCount: "Số stage",
};

interface JourneyStage {
  id: string;
  stageNo: number;
  previousBillId: string | null;
  totalAmount: number;
  status: string;
  transactionAt: string;
  doctorCommissionAmount: number;
  executorCommissionAmount: number;
  indicationCommissionAmount: number;
  stageReferralCommissionAmount: number;
  doctorPayouts: Array<{ doctorName: string; amount: number }>;
  services: string[];
  executors: string[];
}

interface JourneyChain {
  rootBillId: string;
  stageFlow: string;
  totalAmount: number;
  totalDoctorCommission: number;
  stages: JourneyStage[];
}

interface JourneyCustomer {
  id: string;
  fullName: string;
  phone: string;
  yearOfBirth: number | null;
  gender: string | null;
  totalAmount: number;
  totalDoctorCommission: number;
  journeyCount: number;
  journeys: JourneyChain[];
}

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

function genderLabel(gender: string | null) {
  if (gender === "MALE") return "Nam";
  if (gender === "FEMALE") return "Nữ";
  return "—";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "badge-success",
    PENDING: "badge-warning",
    DRAFT: "badge-default",
    CANCELLED: "badge-danger",
    REFUNDED: "badge-danger",
  };

  return <span className={`badge ${map[status] || "badge-default"}`}>{status}</span>;
}

function defaultSortDirection(key: JourneySortKey): SortDirection {
  if (["totalAmount", "totalDoctorCommission", "journeyCount", "yearOfBirth"].includes(key)) {
    return "desc";
  }
  return "asc";
}

export default function JourneyDashboardPage() {
  const [customers, setCustomers] = useState<JourneyCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<JourneySortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
    if (sortBy) {
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDirection);
    }

    fetch(`/api/journeys?${params}`)
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
  }, [page, search, sortBy, sortDirection]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [load]);

  const toggleSort = (key: JourneySortKey) => {
    setExpandedId(null);
    setPage(1);
    setSortBy((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => currentDirection === "asc" ? "desc" : "asc");
        return currentKey;
      }

      setSortDirection(defaultSortDirection(key));
      return key;
    });
  };

  const renderSortableHeader = (label: string, key: JourneySortKey) => {
    const active = sortBy === key;
    const indicator = !active ? "↕" : sortDirection === "asc" ? "↑" : "↓";

    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          fontWeight: 600,
        }}
        aria-label={`Sắp xếp theo ${label}`}
      >
        <span>{label}</span>
        <span style={{ color: active ? "var(--color-info)" : "var(--text-muted)", fontSize: 12 }}>
          {indicator}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="top-header">
        <h1>🧭 Hành trình khách hàng</h1>
      </div>
      <div className="page-content">
        <div className="data-table-container">
          <div className="data-table-header">
            <input
              className="form-input"
              style={{ maxWidth: 320 }}
              placeholder="🔍 Tìm theo tên hoặc số điện thoại..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Tìm hành trình khách hàng"
            />
            <span className="badge badge-info">{pagination.total} khách có hành trình</span>
            {sortBy && (
              <span className="badge badge-default">
                Đang sort: {SORT_LABELS[sortBy]} {sortDirection === "asc" ? "↑" : "↓"}
              </span>
            )}
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>{renderSortableHeader("Khách hàng", "fullName")}</th>
                <th>{renderSortableHeader("Số điện thoại", "phone")}</th>
                <th>{renderSortableHeader("Năm sinh", "yearOfBirth")}</th>
                <th>{renderSortableHeader("Giới tính", "gender")}</th>
                <th>{renderSortableHeader("Tổng số tiền", "totalAmount")}</th>
                <th>{renderSortableHeader("Tổng HH BS", "totalDoctorCommission")}</th>
                <th>{renderSortableHeader("Số stage", "journeyCount")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7}><div className="loading-shimmer" /></td>
                </tr>
              )}
              {!loading && customers.map((customer) => {
                const stageCount = customer.journeyCount;

                return (
                  <Fragment key={customer.id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setExpandedId(expandedId === customer.id ? null : customer.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expandedId === customer.id}
                    >
                      <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{customer.fullName}</td>
                      <td>{customer.phone}</td>
                      <td>{customer.yearOfBirth || "—"}</td>
                      <td>{genderLabel(customer.gender)}</td>
                      <td>{formatVND(customer.totalAmount)}</td>
                      <td>{formatVND(customer.totalDoctorCommission)}</td>
                      <td>
                        <span className="badge badge-info">{stageCount} stage</span>
                      </td>
                    </tr>

                    {expandedId === customer.id && (
                      <tr>
                        <td colSpan={7} style={{ background: "var(--bg-secondary)", padding: 20 }}>
                          <div style={{ display: "grid", gap: 16 }}>
                            {customer.journeys.map((journey) => (
                              <div
                                key={journey.rootBillId}
                                style={{
                                  border: "1px solid var(--border-color)",
                                  borderRadius: 12,
                                  padding: 16,
                                  background: "var(--bg-primary)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                                  <div>
                                    <h3 style={{ margin: 0 }}>Chuỗi điều trị</h3>
                                    <div style={{ color: "var(--text-secondary)", marginTop: 6 }}>
                                      {journey.stageFlow}
                                    </div>
                                  </div>
                                  <div style={{ color: "var(--text-secondary)" }}>
                                    <div>
                                      Tổng chuỗi: <strong style={{ color: "var(--text-primary)" }}>{formatVND(journey.totalAmount)}</strong>
                                    </div>
                                    <div>
                                      Tổng HH BS: <strong style={{ color: "var(--text-primary)" }}>{formatVND(journey.totalDoctorCommission)}</strong>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "stretch", overflowX: "auto", paddingBottom: 4 }}>
                                  {journey.stages.map((stage, index) => (
                                    <Fragment key={stage.id}>
                                      <div
                                        style={{
                                          minWidth: 260,
                                          border: "1px solid var(--border-color)",
                                          borderRadius: 12,
                                          padding: 14,
                                          background: "var(--bg-secondary)",
                                        }}
                                      >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                                          <strong style={{ color: "var(--text-primary)" }}>Stage {stage.stageNo}</strong>
                                          {statusBadge(stage.status)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          Bill: {formatVND(stage.totalAmount)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          Tổng HH bác sĩ: <strong style={{ color: "var(--text-primary)" }}>{formatVND(stage.doctorCommissionAmount)}</strong>
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          HH thực hiện: {formatVND(stage.executorCommissionAmount)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          HH chỉ định: {formatVND(stage.indicationCommissionAmount)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          HH giới thiệu sang stage sau: {formatVND(stage.stageReferralCommissionAmount)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          Dịch vụ: {stage.services.join(", ") || "—"}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                          Người thực hiện: {stage.executors.join(", ") || "Chưa gán"}
                                        </div>
                                        {stage.doctorPayouts.length > 0 && (
                                          <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>
                                            {stage.doctorPayouts.map((payout) => (
                                              <div key={`${stage.id}-${payout.doctorName}`}>
                                                {payout.doctorName}: {formatVND(payout.amount)}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                          {new Date(stage.transactionAt).toLocaleDateString("vi-VN")}
                                        </div>
                                      </div>
                                      {index < journey.stages.length - 1 && (
                                        <div
                                          aria-hidden="true"
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            color: "var(--text-secondary)",
                                            fontSize: 24,
                                            fontWeight: 700,
                                            padding: "0 2px",
                                          }}
                                        >
                                          →
                                        </div>
                                      )}
                                    </Fragment>
                                  ))}
                                </div>
                              </div>
                            ))}

                            {customer.journeys.length === 0 && (
                              <div style={{ color: "var(--text-muted)" }}>
                                Khách này chưa có stage nào.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center" style={{ padding: 40, color: "var(--text-muted)" }}>
                    Chưa có hành trình phù hợp
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
    </>
  );
}
