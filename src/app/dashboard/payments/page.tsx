"use client";
import { useState } from "react";

function formatVND(n: number) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n); }

export default function PaymentsPage() {
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setResult(null);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billId, amount: parseFloat(amount), method }),
    });
    const data = await res.json();
    if (!data.success) { setError(data.error); return; }
    setResult(`✅ Thanh toán thành công: ${formatVND(data.data.amount)} (${data.data.method})`);
    setBillId(""); setAmount("");
  };

  return (
    <>
      <div className="top-header"><h1>💳 Thanh toán</h1></div>
      <div className="page-content">
        <div className="data-table-container" style={{maxWidth:500}}>
          <div className="data-table-header"><h3>Tạo thanh toán mới</h3></div>
          <div style={{padding:24}}>
            {error && <div className="alert alert-error">{error}</div>}
            {result && <div className="alert alert-success">{result}</div>}
            <form onSubmit={handlePay}>
              <div className="form-group">
                <label>Bill ID</label>
                <input className="form-input" aria-label="Bill ID" value={billId} onChange={e => setBillId(e.target.value)} required placeholder="Paste bill ID" />
              </div>
              <div className="form-group">
                <label>Số tiền (VND)</label>
                <input className="form-input" aria-label="Số tiền thanh toán" type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Phương thức</label>
                <select className="form-input" aria-label="Phương thức thanh toán" value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="CASH">Tiền mặt</option>
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CARD">Thẻ</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-full">Thanh toán</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
