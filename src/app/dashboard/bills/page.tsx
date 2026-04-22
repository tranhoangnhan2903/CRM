"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/use-session";

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("vi-VN");
}

function uniqueLabels(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function compressSequentialLabels(values: string[]) {
  return values.filter((value, index) => index === 0 || values[index - 1] !== value);
}

function departmentSummary(values: Array<string | null | undefined>) {
  const labels = uniqueLabels(values);
  return labels.length > 0 ? labels.join(", ") : "Chưa rõ khoa";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: "badge-success",
    PENDING: "badge-warning",
    DRAFT: "badge-default",
    CANCELLED: "badge-danger",
    REFUNDED: "badge-danger",
    COMPLETED: "badge-success",
    IN_PROGRESS: "badge-info",
    NONE: "badge-default",
  };

  return <span className={`badge ${map[status] || "badge-default"}`}>{status}</span>;
}

function payoutBadge(status: string) {
  const map: Record<string, string> = {
    NONE: "badge-default",
    PENDING: "badge-warning",
    PAID: "badge-success",
  };

  const label: Record<string, string> = {
    NONE: "Chưa gửi",
    PENDING: "Đã gửi kế toán",
    PAID: "Đã chi trả",
  };

  return <span className={`badge ${map[status] || "badge-default"}`}>{label[status] || status}</span>;
}

interface Bill {
  id: string;
  departmentLabel: string;
  previousBillId: string | null;
  totalAmount: number;
  status: string;
  transactionAt: string;
  payoutRequestStatus: string;
  payoutRequestedAt: string | null;
  payoutCompletedAt: string | null;
  customer: { id: string; fullName: string };
  orders: Array<{
    id: string;
    executorId?: string | null;
    service: {
      name: string;
      department?: { id: string; name: string } | null;
    };
    executor: { fullName: string } | null;
    quantity: number;
    price: number;
    status: string;
  }>;
  payments: Array<{ amount: number; method: string; status: string }>;
  commissions: Array<{
    id: string;
    type: string;
    amount: number;
    status: string;
    userId?: string;
    serviceOrderId?: string | null;
  }>;
  _count: { commissions: number };
}

interface ServiceOption {
  id: string;
  code: string;
  name: string;
  price: number;
  department?: { id: string; name: string } | null;
}

interface DoctorOption {
  id: string;
  fullName: string;
  department: string | null;
  departmentId: string | null;
}

interface StageOrderForm {
  serviceId: string;
  executorId: string;
  quantity: string;
}

interface DoctorBillDetail {
  bill: Bill;
  ownRevenue: number;
  actualBillCommissionAmount: number;
  executionCommission: number;
  indicationCommission: number;
  referralToNextAmount: number;
  sourceDepartmentLabel: string;
  nextDepartmentLabel: string | null;
  nextBill: Bill | null;
}

interface DoctorCustomerGroup {
  customerId: string;
  customerName: string;
  details: DoctorBillDetail[];
  totalRevenue: number;
  totalCommission: number;
  pendingPayoutAmount: number;
  paidPayoutAmount: number;
  eligibleBillIds: string[];
  latestDate: string;
  latestDateMs: number;
  departmentPath: string;
}

const CREATE_STAGE_ROLES = ["ADMIN", "RECEPTIONIST", "ACCOUNTANT", "MANAGER"];

function createEmptyStageOrder(): StageOrderForm {
  return {
    serviceId: "",
    executorId: "",
    quantity: "1",
  };
}

export default function BillsPage() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const [bills, setBills] = useState<Bill[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showStageModal, setShowStageModal] = useState(false);
  const [creatingStage, setCreatingStage] = useState(false);
  const [stageSourceBill, setStageSourceBill] = useState<Bill | null>(null);
  const [stageOrders, setStageOrders] = useState<StageOrderForm[]>([createEmptyStageOrder()]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [payoutFilter, setPayoutFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const viewerRole = sessionUser?.role || null;
  const viewerUserId = sessionUser?.id || null;
  const canCreateStage = viewerRole ? CREATE_STAGE_ROLES.includes(viewerRole) : false;
  const isDoctorView = viewerRole === "DOCTOR";
  const canManageBills = viewerRole ? ["ADMIN", "ACCOUNTANT", "RECEPTIONIST", "MANAGER"].includes(viewerRole) : false;

  const load = useCallback(async () => {
    if (!sessionUser) {
      setBills([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });
    if (search.trim()) {
      params.set("q", search.trim());
    }
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (payoutFilter) {
      params.set("payoutStatus", payoutFilter);
    }
    if (fromDate) {
      params.set("fromDate", fromDate);
    }
    if (toDate) {
      params.set("toDate", toDate);
    }

    const response = await fetch(`/api/bills?${params}`);
    const result = await response.json();

    if (result.success) {
      setBills(result.data);
      if (result.meta?.pagination) {
        setPagination(result.meta.pagination);
      }
    } else {
      setNotice({ type: "error", message: result.error || "Không thể tải danh sách hóa đơn" });
    }

    setLoading(false);
  }, [fromDate, page, payoutFilter, search, sessionUser, statusFilter, toDate]);

  const loadStageLookups = useCallback(async () => {
    if (!sessionUser || !canCreateStage) {
      return;
    }

    const [servicesResponse, doctorsResponse] = await Promise.all([
      fetch("/api/services"),
      fetch("/api/users?role=DOCTOR&lightweight=1"),
    ]);

    const [servicesResult, doctorsResult] = await Promise.all([
      servicesResponse.json(),
      doctorsResponse.json(),
    ]);

    if (servicesResult.success) {
      setServices(servicesResult.data);
    }

    if (doctorsResult.success) {
      setDoctors(doctorsResult.data);
    }
  }, [canCreateStage, sessionUser]);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      void load();
      void loadStageLookups();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [load, loadStageLookups, sessionLoading]);

  const runBillAction = async (payload: Record<string, string>) => {
    const response = await fetch("/api/bills", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.success) {
      setNotice({ type: "error", message: result.error || "Không thể xử lý hóa đơn" });
      return;
    }

    const successLabel = payload.action === "REQUEST_PAYOUT"
      ? "Đã gửi yêu cầu thanh toán cho kế toán"
      : payload.action === "MARK_PAYOUT_PAID"
        ? "Đã ghi nhận kế toán chi trả"
        : "Đã cập nhật hóa đơn";

    setNotice({ type: "success", message: successLabel });
    void load();
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const response = await fetch("/api/service-orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: orderId, status }),
    });

    const result = await response.json();
    if (!result.success) {
      setNotice({ type: "error", message: result.error || "Không thể cập nhật trạng thái dịch vụ" });
      return;
    }

    setNotice({ type: "success", message: "Đã cập nhật trạng thái dịch vụ" });
    void load();
  };

  const openCreateStageModal = (bill: Bill) => {
    setStageSourceBill(bill);
    setStageOrders([createEmptyStageOrder()]);
    setShowStageModal(true);
  };

  const closeCreateStageModal = () => {
    if (creatingStage) {
      return;
    }

    setShowStageModal(false);
    setStageSourceBill(null);
    setStageOrders([createEmptyStageOrder()]);
  };

  const updateStageOrder = (index: number, patch: Partial<StageOrderForm>) => {
    setStageOrders((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  };

  const addStageOrder = () => {
    setStageOrders((current) => [...current, createEmptyStageOrder()]);
  };

  const removeStageOrder = (index: number) => {
    setStageOrders((current) => (
      current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)
    ));
  };

  const submitCreateStage = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stageSourceBill) {
      return;
    }

    const invalidOrder = stageOrders.find((item) => {
      const quantity = Number(item.quantity);
      return !item.serviceId || !item.executorId || Number.isNaN(quantity) || quantity <= 0;
    });

    if (invalidOrder) {
      setNotice({ type: "error", message: "Vui lòng chọn dịch vụ, bác sĩ và số lượng hợp lệ cho từng dòng." });
      return;
    }

    setCreatingStage(true);

    const response = await fetch("/api/bills", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerId: stageSourceBill.customer.id,
        previousBillId: stageSourceBill.id,
        orders: stageOrders.map((item) => ({
          serviceId: item.serviceId,
          executorId: item.executorId,
          quantity: Number(item.quantity),
        })),
      }),
    });

    const result = await response.json();
    setCreatingStage(false);

    if (!result.success) {
      setNotice({ type: "error", message: result.error || "Không thể tạo khoa tiếp theo" });
      return;
    }

    setNotice({
      type: "success",
      message: `Đã tạo khoa mới (${result.data.departmentLabel}) cho khách ${stageSourceBill.customer.fullName}`,
    });
    closeCreateStageModal();
    setExpandedId(result.data.id);
    await load();
  };

  const totalBillRevenue = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalDoctorCommission = bills.reduce((sum, bill) => {
    const ownCommission = bill.commissions
      .filter((commission) => ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"].includes(commission.type) && commission.status !== "CANCELLED")
      .filter((commission) => !isDoctorView || commission.userId === viewerUserId)
      .reduce((commissionSum, commission) => commissionSum + commission.amount, 0);
    return sum + ownCommission;
  }, 0);
  const pendingPayoutAmount = bills.reduce((sum, bill) => {
    if (bill.payoutRequestStatus !== "PENDING") {
      return sum;
    }

    return sum + bill.commissions
      .filter((commission) => ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"].includes(commission.type) && commission.status !== "CANCELLED")
      .filter((commission) => !isDoctorView || commission.userId === viewerUserId)
      .reduce((commissionSum, commission) => commissionSum + commission.amount, 0);
  }, 0);

  const nextStageMap = useMemo(() => {
    const map = new Map<string, Bill>();
    bills.forEach((bill) => {
      if (bill.previousBillId) {
        map.set(bill.previousBillId, bill);
      }
    });
    return map;
  }, [bills]);

  const stageDraftTotal = useMemo(() => {
    return stageOrders.reduce((sum, item) => {
      const service = services.find((serviceOption) => serviceOption.id === item.serviceId);
      const quantity = Number(item.quantity) || 0;
      return sum + ((service?.price || 0) * quantity);
    }, 0);
  }, [services, stageOrders]);

  const doctorCustomerGroups = useMemo<DoctorCustomerGroup[]>(() => {
    if (!isDoctorView || !viewerUserId) {
      return [];
    }

    const groups = new Map<string, DoctorCustomerGroup>();

    for (const bill of bills) {
      const ownOrders = bill.orders.filter((order) => order.executorId === viewerUserId);
      const ownOrderIds = new Set(ownOrders.map((order) => order.id));
      const ownRevenue = ownOrders.reduce((sum, order) => sum + order.price * order.quantity, 0);
      const actualBillCommissions = bill.commissions.filter((commission) => (
        ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"].includes(commission.type)
        && commission.status !== "CANCELLED"
        && commission.userId === viewerUserId
      ));
      const actualBillCommissionAmount = actualBillCommissions.reduce((sum, commission) => sum + commission.amount, 0);
      const executionCommission = actualBillCommissions
        .filter((commission) => commission.type === "EXECUTOR")
        .reduce((sum, commission) => sum + commission.amount, 0);
      const indicationCommission = actualBillCommissions
        .filter((commission) => commission.type === "INDICATION")
        .reduce((sum, commission) => sum + commission.amount, 0);
      const nextBill = nextStageMap.get(bill.id) || null;
      const referralToNextAmount = nextBill
        ? nextBill.commissions
          .filter((commission) => (
            commission.type === "STAGE_REFERRAL"
            && commission.status !== "CANCELLED"
            && commission.userId === viewerUserId
            && commission.serviceOrderId
            && ownOrderIds.has(commission.serviceOrderId)
          ))
          .reduce((sum, commission) => sum + commission.amount, 0)
        : 0;

      const detail: DoctorBillDetail = {
        bill,
        ownRevenue,
        actualBillCommissionAmount,
        executionCommission,
        indicationCommission,
        referralToNextAmount,
        sourceDepartmentLabel: departmentSummary(ownOrders.map((order) => order.service.department?.name)),
        nextDepartmentLabel: nextBill
          ? departmentSummary(nextBill.orders.map((order) => order.service.department?.name))
          : null,
        nextBill,
      };

      const customerId = bill.customer.id;
      const customerName = bill.customer.fullName;
      const currentGroup = groups.get(customerId) ?? {
        customerId,
        customerName,
        details: [],
        totalRevenue: 0,
        totalCommission: 0,
        pendingPayoutAmount: 0,
        paidPayoutAmount: 0,
        eligibleBillIds: [],
        latestDate: bill.transactionAt,
        latestDateMs: new Date(bill.transactionAt).getTime(),
        departmentPath: "",
      };

      const shouldShowDetail = ownOrders.length > 0 || referralToNextAmount > 0;
      if (shouldShowDetail) {
        currentGroup.details.push(detail);
      }

      currentGroup.totalRevenue += ownRevenue;
      currentGroup.totalCommission += executionCommission + indicationCommission + referralToNextAmount;
      if (bill.payoutRequestStatus === "PENDING") {
        currentGroup.pendingPayoutAmount += actualBillCommissionAmount;
      }
      if (bill.payoutRequestStatus === "PAID") {
        currentGroup.paidPayoutAmount += actualBillCommissionAmount;
      }

      if (bill.status === "PAID" && bill.payoutRequestStatus === "NONE" && actualBillCommissionAmount > 0) {
        currentGroup.eligibleBillIds.push(bill.id);
      }

      const billDateMs = new Date(bill.transactionAt).getTime();
      if (billDateMs > currentGroup.latestDateMs) {
        currentGroup.latestDate = bill.transactionAt;
        currentGroup.latestDateMs = billDateMs;
      }

      groups.set(customerId, currentGroup);
    }

    return Array.from(groups.values())
      .map((group) => {
        const details = [...group.details].sort(
          (left, right) => new Date(left.bill.transactionAt).getTime() - new Date(right.bill.transactionAt).getTime()
        );
        const departmentPath = compressSequentialLabels(
          details.flatMap((detail) => {
            const path = [detail.sourceDepartmentLabel];
            if (detail.referralToNextAmount > 0 && detail.nextDepartmentLabel) {
              path.push(detail.nextDepartmentLabel);
            }
            return path;
          })
        ).join(" -> ");

        return {
          ...group,
          details,
          departmentPath: departmentPath || "Chưa có dữ liệu khoa",
        };
      })
      .sort((left, right) => right.latestDateMs - left.latestDateMs);
  }, [bills, isDoctorView, nextStageMap, viewerUserId]);

  const requestDoctorPayout = async (billIds: string[]) => {
    if (billIds.length === 0) {
      setNotice({ type: "error", message: "Chưa có bill đủ điều kiện gửi thanh toán." });
      return;
    }

    const failedMessages: string[] = [];

    for (const billId of billIds) {
      const response = await fetch("/api/bills", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: billId, action: "REQUEST_PAYOUT" }),
      });

      const result = await response.json();
      if (!result.success) {
        failedMessages.push(result.error || `Không thể gửi thanh toán cho bill ${billId}`);
      }
    }

    if (failedMessages.length > 0) {
      setNotice({ type: "error", message: failedMessages[0] });
      return;
    }

    setNotice({
      type: "success",
      message: billIds.length === 1
        ? "Đã gửi yêu cầu thanh toán cho kế toán."
        : `Đã gửi ${billIds.length} yêu cầu thanh toán cho kế toán.`,
    });
    await load();
  };

  return (
    <>
      <div className="top-header">
        <h1>{isDoctorView ? "🧾 Doanh thu và thanh toán" : "🧾 Hóa đơn"}</h1>
      </div>
      <div className="page-content">
        {notice && (
          <div className={`alert ${notice.type === "success" ? "alert-success" : "alert-error"}`} style={{ marginBottom: 16 }}>
            {notice.message}
          </div>
        )}

        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-icon cyan">💵</div>
            <div className="stat-value">{formatVND(isDoctorView ? doctorCustomerGroups.reduce((sum, group) => sum + group.totalRevenue, 0) : totalBillRevenue)}</div>
            <div className="stat-label">{isDoctorView ? "Tổng doanh thu của bác sĩ" : "Tổng bill đang hiển thị"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">👨‍⚕️</div>
            <div className="stat-value">{formatVND(isDoctorView ? doctorCustomerGroups.reduce((sum, group) => sum + group.totalCommission, 0) : totalDoctorCommission)}</div>
            <div className="stat-label">{isDoctorView ? "Tổng hoa hồng của bác sĩ" : "Doanh thu của bác sĩ"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon amber">📨</div>
            <div className="stat-value">{formatVND(isDoctorView ? doctorCustomerGroups.reduce((sum, group) => sum + group.pendingPayoutAmount, 0) : pendingPayoutAmount)}</div>
            <div className="stat-label">{isDoctorView ? "Đã gửi thanh toán" : "Đang chờ kế toán chi trả"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon cyan">🔄</div>
            <div className="stat-value">{isDoctorView ? doctorCustomerGroups.length : bills.length}</div>
            <div className="stat-label">{isDoctorView ? "Số khách đang theo dõi" : "Số bill / khoa"}</div>
          </div>
        </div>

        <div className="data-table-container" style={{ marginBottom: 16 }}>
          <div className="data-table-header" style={{ gap: 12, flexWrap: "wrap" }}>
            <input
              className="form-input"
              style={{ width: 260 }}
              placeholder="🔍 Tìm theo khách hàng / SĐT"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Tìm hóa đơn theo khách hàng hoặc số điện thoại"
            />
            <select
              className="form-input"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo trạng thái bill"
            >
              <option value="">Tất cả bill</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            <select
              className="form-input"
              style={{ width: 180 }}
              value={payoutFilter}
              onChange={(event) => {
                setPayoutFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo trạng thái thanh toán nội bộ"
            >
              <option value="">Tất cả thanh toán nội bộ</option>
              <option value="NONE">Chưa gửi</option>
              <option value="PENDING">Đã gửi kế toán</option>
              <option value="PAID">Đã chi trả</option>
            </select>
            <input
              className="form-input"
              style={{ width: 180 }}
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              aria-label="Từ ngày"
            />
            <input
              className="form-input"
              style={{ width: 180 }}
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
              aria-label="Đến ngày"
            />
            <span className="badge badge-info">{pagination.total} bill</span>
          </div>
        </div>

        <div className="data-table-container">
          {isDoctorView ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Khách</th>
                  <th>Khoa liên quan</th>
                  <th>Doanh thu BS</th>
                  <th>Hoa hồng BS</th>
                  <th>Thanh toán</th>
                  <th>Ngày gần nhất</th>
                  <th>Yêu cầu</th>
                </tr>
              </thead>
              <tbody>
                {(loading || sessionLoading) && (
                  <tr>
                    <td colSpan={7}>
                      <div className="loading-shimmer" />
                    </td>
                  </tr>
                )}
                {!loading && !sessionLoading && doctorCustomerGroups.map((group) => {
                  const rowId = `customer-${group.customerId}`;
                  const groupPayoutStatus = group.pendingPayoutAmount > 0
                    ? "PENDING"
                    : group.paidPayoutAmount > 0 && group.eligibleBillIds.length === 0
                      ? "PAID"
                      : "NONE";

                  return (
                    <Fragment key={rowId}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedId(expandedId === rowId ? null : rowId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setExpandedId(expandedId === rowId ? null : rowId);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-expanded={expandedId === rowId}
                      >
                        <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{group.customerName}</td>
                        <td>
                          <div style={{ color: "var(--text-primary)" }}>{group.departmentPath}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            {group.details.length} điểm ghi nhận doanh thu
                          </div>
                        </td>
                        <td>{formatVND(group.totalRevenue)}</td>
                        <td>{formatVND(group.totalCommission)}</td>
                        <td>
                          <div>{payoutBadge(groupPayoutStatus)}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            {group.eligibleBillIds.length > 0
                              ? `${group.eligibleBillIds.length} bill có thể gửi`
                              : "Chưa có bill mới cần gửi"}
                          </div>
                        </td>
                        <td>{formatDate(group.latestDate)}</td>
                        <td>
                          {group.eligibleBillIds.length > 0 ? (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                void requestDoctorPayout(group.eligibleBillIds);
                              }}
                            >
                              Thanh toán
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Bấm vào để xem chi tiết</span>
                          )}
                        </td>
                      </tr>
                      {expandedId === rowId && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--bg-secondary)", padding: 20 }}>
                            <div style={{ display: "grid", gap: 16 }}>
                              {group.details.map((detail, index) => (
                                <Fragment key={detail.bill.id}>
                                  {index > 0 && (
                                    <div style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                                      {group.details[index - 1].sourceDepartmentLabel}
                                      {" -> "}
                                      {detail.sourceDepartmentLabel}
                                    </div>
                                  )}
                                  <div
                                    style={{
                                      border: "1px solid var(--border-color)",
                                      borderRadius: 14,
                                      background: "var(--bg-primary)",
                                      padding: 18,
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
                                      <div>
                                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                                          Khoa ghi nhận: {detail.sourceDepartmentLabel}
                                        </div>
                                        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                                          Ngày {formatDate(detail.bill.transactionAt)} · Bill {formatVND(detail.bill.totalAmount)}
                                        </div>
                                      </div>
                                      <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
                                        {statusBadge(detail.bill.status)}
                                        {payoutBadge(detail.bill.payoutRequestStatus)}
                                      </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
                                      <div>
                                        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Doanh thu bác sĩ</div>
                                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatVND(detail.ownRevenue)}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>HH thực hiện</div>
                                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatVND(detail.executionCommission)}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>HH chỉ định trong khoa</div>
                                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatVND(detail.indicationCommission)}</div>
                                      </div>
                                      <div>
                                        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>HH giới thiệu sang khoa sau</div>
                                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatVND(detail.referralToNextAmount)}</div>
                                      </div>
                                    </div>

                                    <table className="data-table" style={{ marginBottom: 0 }}>
                                      <thead>
                                        <tr>
                                          <th>Dịch vụ</th>
                                          <th>Khoa</th>
                                          <th>SL</th>
                                          <th>Giá</th>
                                          <th>Trạng thái</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.bill.orders
                                          .filter((order) => order.executorId === viewerUserId)
                                          .map((order) => (
                                            <tr key={order.id}>
                                              <td style={{ color: "var(--text-primary)" }}>{order.service.name}</td>
                                              <td>{order.service.department?.name || "Chưa rõ khoa"}</td>
                                              <td>{order.quantity}</td>
                                              <td>{formatVND(order.price)}</td>
                                              <td>{statusBadge(order.status)}</td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>

                                    {detail.referralToNextAmount > 0 && detail.nextBill && detail.nextDepartmentLabel && (
                                      <div
                                        style={{
                                          marginTop: 16,
                                          borderRadius: 12,
                                          padding: 14,
                                          background: "color-mix(in srgb, var(--color-info) 10%, white)",
                                          border: "1px solid color-mix(in srgb, var(--color-info) 24%, white)",
                                        }}
                                      >
                                        <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>
                                          Giới thiệu từ {detail.sourceDepartmentLabel}
                                          {" -> "}
                                          {detail.nextDepartmentLabel}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)" }}>
                                          Hoa hồng giới thiệu: {formatVND(detail.referralToNextAmount)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)" }}>
                                          Tính trên bill sau: {formatVND(detail.nextBill.totalAmount)}
                                        </div>
                                        <div style={{ color: "var(--text-secondary)" }}>
                                          Trạng thái gửi kế toán của bill sau: {payoutBadge(detail.nextBill.payoutRequestStatus)}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </Fragment>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && !sessionLoading && doctorCustomerGroups.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center" style={{ padding: 40, color: "var(--text-muted)" }}>
                      Chưa có hóa đơn
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Khách</th>
                  <th>Stage</th>
                  <th>Tổng bill</th>
                  <th>Doanh thu BS</th>
                  <th>Bill</th>
                  <th>Thanh toán nội bộ</th>
                  <th>Ngày</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {(loading || sessionLoading) && (
                  <tr>
                    <td colSpan={8}>
                      <div className="loading-shimmer" />
                    </td>
                  </tr>
                )}
                {!loading && !sessionLoading && bills.map((bill) => {
                  const doctorRevenue = bill.orders
                    .reduce((sum, order) => sum + order.price * order.quantity, 0);
                  const executorCommissionAmount = bill.commissions
                    .filter((commission) => ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"].includes(commission.type) && commission.status !== "CANCELLED")
                    .reduce((sum, commission) => sum + commission.amount, 0);
                  const nextStageBill = nextStageMap.get(bill.id);
                  const canBranchToNextStage = canCreateStage && bill.status === "PAID" && !nextStageBill;

                  return (
                    <Fragment key={bill.id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedId(expandedId === bill.id ? null : bill.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setExpandedId(expandedId === bill.id ? null : bill.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-expanded={expandedId === bill.id}
                      >
                        <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{bill.customer.fullName}</td>
                        <td>
                          <div>{bill.departmentLabel}</div>
                          {bill.previousBillId && (
                            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Nối từ khoa trước</div>
                          )}
                          {nextStageBill && (
                            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                              Đã nối sang {nextStageBill.departmentLabel}
                            </div>
                          )}
                        </td>
                        <td>{formatVND(bill.totalAmount)}</td>
                        <td>{formatVND(doctorRevenue)}</td>
                        <td>{statusBadge(bill.status)}</td>
                        <td>
                          <div>{payoutBadge(bill.payoutRequestStatus)}</div>
                          {executorCommissionAmount > 0 && (
                            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                              {formatVND(executorCommissionAmount)}
                            </div>
                          )}
                        </td>
                        <td>{formatDate(bill.transactionAt)}</td>
                        <td>
                          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                            {canBranchToNextStage && (
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCreateStageModal(bill);
                                }}
                              >
                                Tạo stage tiếp
                              </button>
                            )}
                            {bill.status === "DRAFT" && canManageBills && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void runBillAction({ id: bill.id, status: "PENDING" });
                                }}
                              >
                                Gửi bill
                              </button>
                            )}
                            {bill.status === "PENDING" && canManageBills && (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void runBillAction({ id: bill.id, status: "PAID" });
                                }}
                              >
                                Xác nhận đã thu
                              </button>
                            )}
                            {bill.status === "PAID" && bill.payoutRequestStatus === "NONE" && executorCommissionAmount > 0 && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void runBillAction({ id: bill.id, action: "REQUEST_PAYOUT" });
                                }}
                              >
                                Gửi thanh toán
                              </button>
                            )}
                            {bill.payoutRequestStatus === "PENDING" && (viewerRole === "ACCOUNTANT" || viewerRole === "ADMIN") && (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void runBillAction({ id: bill.id, action: "MARK_PAYOUT_PAID" });
                                }}
                              >
                                Đã chi trả
                              </button>
                            )}
                            {bill.status !== "CANCELLED" && bill.status !== "PAID" && canManageBills && (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void runBillAction({ id: bill.id, status: "CANCELLED" });
                                }}
                              >
                                Hủy
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === bill.id && (
                        <tr>
                          <td colSpan={8} style={{ background: "var(--bg-secondary)", padding: 20 }}>
                            <h4 style={{ marginBottom: 12 }}>Chi tiết dịch vụ - {bill.departmentLabel}</h4>
                            <table className="data-table" style={{ marginBottom: 0 }}>
                              <thead>
                                <tr>
                                  <th>Dịch vụ</th>
                                  <th>Người thực hiện</th>
                                  <th>SL</th>
                                  <th>Giá</th>
                                  <th>Trạng thái</th>
                                  <th>Hành động</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bill.orders.map((order) => (
                                  <tr key={order.id}>
                                    <td style={{ color: "var(--text-primary)" }}>{order.service.name}</td>
                                    <td>{order.executor?.fullName || "—"}</td>
                                    <td>{order.quantity}</td>
                                    <td>{formatVND(order.price)}</td>
                                    <td>{statusBadge(order.status)}</td>
                                    <td>
                                      <div className="flex gap-2">
                                        {order.status === "PENDING" && (
                                          <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => void updateOrderStatus(order.id, "IN_PROGRESS")}
                                          >
                                            Bắt đầu
                                          </button>
                                        )}
                                        {order.status === "IN_PROGRESS" && (
                                          <button
                                            className="btn btn-sm btn-success"
                                            onClick={() => void updateOrderStatus(order.id, "COMPLETED")}
                                          >
                                            Hoàn thành
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                              <div>
                                <h4 style={{ marginBottom: 8 }}>Tổng hợp thanh toán</h4>
                                <div style={{ color: "var(--text-secondary)" }}>
                                  Doanh thu bác sĩ: {formatVND(doctorRevenue)}
                                </div>
                                <div style={{ color: "var(--text-secondary)" }}>
                                  Tổng hoa hồng bác sĩ cần chi: {formatVND(executorCommissionAmount)}
                                </div>
                                <div style={{ color: "var(--text-secondary)" }}>
                                  Trạng thái gửi kế toán: {payoutBadge(bill.payoutRequestStatus)}
                                </div>
                                {nextStageBill && (
                                  <div style={{ color: "var(--text-secondary)" }}>
                                    Khoa tiếp theo: {nextStageBill.departmentLabel}
                                  </div>
                                )}
                              </div>

                              {bill.payments.length > 0 && (
                                <div>
                                  <h4 style={{ marginBottom: 8 }}>Thu tiền khách</h4>
                                  {bill.payments.map((payment, index) => (
                                    <div key={`${bill.id}-payment-${index}`} className="flex gap-4 items-center" style={{ padding: "4px 0" }}>
                                      <span>{formatVND(payment.amount)}</span>
                                      <span className="badge badge-default">{payment.method}</span>
                                      {statusBadge(payment.status)}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && !sessionLoading && bills.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center" style={{ padding: 40, color: "var(--text-muted)" }}>
                      Chưa có hóa đơn
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
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

      {showStageModal && stageSourceBill && (
        <div
          className="modal-overlay"
          onClick={closeCreateStageModal}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              closeCreateStageModal();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Đóng hộp thoại nối khoa mới"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nối khoa mới"
            style={{ maxWidth: 960 }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <h2>🔀 Nối khoa mới</h2>
            <div style={{ marginBottom: 16, color: "var(--text-secondary)" }}>
              Khách: <strong style={{ color: "var(--text-primary)" }}>{stageSourceBill.customer.fullName}</strong>
              {" · "}
              Bill nguồn: <strong style={{ color: "var(--text-primary)" }}>{stageSourceBill.departmentLabel}</strong>
              {" → "}
              Tạo mới: <strong style={{ color: "var(--text-primary)" }}>khoa kế tiếp</strong>
            </div>

            <form onSubmit={(event) => void submitCreateStage(event)}>
              {stageOrders.map((item, index) => {
                const selectedService = services.find((service) => service.id === item.serviceId);
                const availableDoctors = selectedService?.department?.id
                  ? doctors.filter((doctor) => doctor.departmentId === selectedService.department?.id)
                  : doctors;

                return (
                  <div
                    key={`stage-order-${index}`}
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <h3 style={{ margin: 0 }}>Dòng dịch vụ {index + 1}</h3>
                      {stageOrders.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removeStageOrder(index)}
                        >
                          Xóa dòng
                        </button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 120px", gap: 16 }}>
                      <div className="form-group">
                        <label>Dịch vụ</label>
                        <select
                          className="form-input"
                          value={item.serviceId}
                          onChange={(event) => updateStageOrder(index, { serviceId: event.target.value, executorId: "" })}
                          required
                        >
                          <option value="">Chọn dịch vụ</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} · {formatVND(service.price)}{service.department ? ` · ${service.department.name}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Bác sĩ / người thực hiện</label>
                        <select
                          className="form-input"
                          value={item.executorId}
                          onChange={(event) => updateStageOrder(index, { executorId: event.target.value })}
                          required
                        >
                          <option value="">Chọn bác sĩ</option>
                          {availableDoctors.map((doctor) => (
                            <option key={doctor.id} value={doctor.id}>
                              {doctor.fullName}{doctor.department ? ` · ${doctor.department}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Số lượng</label>
                        <input
                          className="form-input"
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) => updateStageOrder(index, { quantity: event.target.value })}
                          required
                        />
                      </div>
                    </div>

                    {selectedService && (
                      <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                        Tạm tính dòng này: {formatVND(selectedService.price * (Number(item.quantity) || 0))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={addStageOrder}>
                  + Thêm dịch vụ
                </button>
                <div style={{ color: "var(--text-secondary)" }}>
                  Tạm tính khoa mới: <strong style={{ color: "var(--text-primary)" }}>{formatVND(stageDraftTotal)}</strong>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeCreateStageModal} disabled={creatingStage}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={creatingStage}>
                  {creatingStage ? "Đang tạo..." : "Nối khoa mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
