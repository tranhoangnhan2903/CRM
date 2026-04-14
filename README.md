# Clinic CRM

CRM theo dõi hoa hồng, stage điều trị và yêu cầu chi trả cho bác sĩ. Hệ thống này đọc dữ liệu nghiệp vụ từ Data Warehouse (DW) của Medifam, đồng thời vẫn giữ một số luồng fallback/realtime qua HIS khi cần.

## Chạy app

```bash
npm install
npm run build
npm run start
```

App mặc định chạy ở [http://localhost:3000](http://localhost:3000).

## Cấu hình Database

Codebase hiện đã chuyển sang `PostgreSQL`. File [.env](/Users/tranhoangnhan/Documents/CRM/.env) local đang trỏ vào database:

- `postgresql://tranhoangnhan@localhost:5432/clinic_crm?schema=public`

Nếu cần dựng môi trường mới, copy [.env.postgres.example](/Users/tranhoangnhan/Documents/CRM/.env.postgres.example) thành `.env`.

Ví dụ chuyển sang PostgreSQL:

```bash
cp .env.postgres.example .env
npx prisma generate
npx prisma db push
npm run build
npm run start
```

Lưu ý:

- production nên dùng PostgreSQL để tránh lock khi nhiều người dùng cùng ghi dữ liệu
- bộ migrations hiện tại được sinh từ SQLite, nên lần bootstrap PostgreSQL đầu tiên nên dùng `prisma db push`; sau đó mới tiếp tục quản lý migration theo PostgreSQL
- dữ liệu SQLite cũ có thể export/import qua các script trong [scripts/export-sqlite-data.ts](/Users/tranhoangnhan/Documents/CRM/scripts/export-sqlite-data.ts) và [scripts/import-postgres-data.ts](/Users/tranhoangnhan/Documents/CRM/scripts/import-postgres-data.ts)

## Auth frontend

Frontend hiện dùng `httpOnly cookie` làm session chính. Dashboard sẽ đọc session qua `/api/auth/me`, không còn phụ thuộc `localStorage token`.

## Cấu hình DW

Copy [`.env.example`](/Users/tranhoangnhan/Documents/CRM/.env.example) thành `.env` rồi điền:

- `DW_DATABASE_URL`: connection string PostgreSQL tới Medifam DW
- `DW_SCHEMA`: schema chứa dữ liệu gốc, mặc định là `raw`

Codebase phase 1 hiện đọc DW trực tiếp qua PostgreSQL, bám theo tài liệu [dw_integration_guide.md](/Users/tranhoangnhan/Documents/dw_integration_guide.md):

- `raw."VW_BS_ITEM_LIST"` cho danh mục dịch vụ
- `raw."VW_CIS_EXAM_SUMMARY_SYNC_BI"` cho header lượt khám / bệnh nhân
- `raw."DAS_SO_LINE"` cho line dịch vụ, `SOLID`, mapping stage
- `raw."VW_SO_SUMMARY"` để bổ sung tổng tiền / trạng thái bill khi có sẵn

## Cấu hình HIS (fallback / realtime)

Copy [`.env.example`](/Users/tranhoangnhan/Documents/CRM/.env.example) thành `.env` rồi điền:

- `HIS_BASE_URL`: base URL của HIS đã publish
- `HIS_STORE_NAME`: tenant/subdomain của HIS
- `HIS_DOMAIN`: domain của HIS
- `HIS_USERNAME`: tài khoản CRM dùng để gọi HIS API
- `HIS_PASSWORD`: mật khẩu của tài khoản đó
- `HIS_CMPID`: mã công ty/cơ sở trong HIS
- `HIS_EMPID`: mã nhân sự dùng cho endpoint gói khám
- `HIS_WEBHOOK_SECRET`: secret để HIS đẩy webhook sang CRM

## Màn hình HIS trong CRM

Sau khi đăng nhập role `ADMIN` hoặc `MANAGER`, vào:

- [HIS Sync Dashboard](/Users/tranhoangnhan/Documents/CRM/src/app/dashboard/his/page.tsx)
- [Packages Dashboard](/Users/tranhoangnhan/Documents/CRM/src/app/dashboard/packages/page.tsx)

Tại đây có các nút:

- Đồng bộ bác sĩ từ DW
- Đồng bộ dịch vụ từ DW
- Đồng bộ gói khám: fallback qua HIS nếu chưa có bảng package tương ứng ở DW
- Đồng bộ khách hàng từ DW
- Đồng bộ luồng phân khoa từ DW (`SOHID`/`SOLID` -> bill/stage/order)

## Endpoint tích hợp HIS

- `GET /api/his/overview`
  Trả trạng thái cấu hình DW, số lượng dữ liệu đã sync và các event gần nhất.

- `POST /api/his/sync`
  Dùng để kéo dữ liệu từ DW vào CRM. Target `packages` hiện vẫn fallback qua HIS nếu đã có cấu hình HIS.

Ví dụ:

```json
{
  "target": "all"
}
```

```json
{
  "target": "customers",
  "search": "Nguyen Van A"
}
```

```json
{
  "target": "exams",
  "fromDate": "2026-04-01",
  "toDate": "2026-04-07"
}
```

- `POST /api/his/webhook`
  Dùng cho HIS push đăng ký mới hoặc stage mới sang CRM.

Header:

```text
x-his-secret: <HIS_WEBHOOK_SECRET>
```

Payload mẫu:

```json
{
  "externalEventId": "his-reg-10001",
  "eventType": "REGISTRATION",
  "previousSohId": null,
  "customer": {
    "CMPID": 1,
    "CUSTID": 12345,
    "CUSTCD": "BN000123",
    "CUSTNM": "Nguyen Van A",
    "DOB": "1990-01-01",
    "GENDER": "M",
    "FONE": "0900000000",
    "ADDRFULL": "Ha Noi"
  },
  "introducer": {
    "INTROEMPID": 100,
    "INTROEMPNM": "Sale A"
  },
  "exam": {
    "CMPID": 1,
    "SOHID": 8888,
    "SOHCD": "KB2404070001",
    "STATUS": "PAID",
    "TOTAL_AMT": 500000,
    "SRV_DIVISION": "NOI",
    "DIVISION_STR": "Khoa Noi",
    "SRV_ROOM": "P101",
    "SRV_GROUP": "KB"
  },
  "services": [
    {
      "SOHID": 8888,
      "SOLID": 9999,
      "ITID": 321,
      "ITCODE": "KSK001",
      "ITNM": "Kham tong quat",
      "ITPRICE": 500000,
      "QTY": 1,
      "PROEMPID": 200,
      "PROEMPNM": "BS A",
      "INTROEMPID": 100,
      "INTROEMPNM": "Sale A"
    }
  ]
}
```

## Dữ liệu HIS đang map vào CRM thế nào

- `CUSTID` -> `Customer.hisCustomerId`
- `EMPID` -> `User.hisEmployeeId`
- `ITID` -> `Service.hisServiceId`
- `PKGSID` -> `HealthPackage.hisPackageId`
- `SOHID` -> `Bill.hisSohId`
- `SOLID` -> `ServiceOrder.hisSolId`

Nhờ vậy CRM giữ được dashboard stage, hoa hồng, chi trả kế toán nhưng nguồn dữ liệu thật vẫn là HIS.

## Ghi chú triển khai phase 1

- Webhook `POST /api/his/webhook` vẫn giữ nguyên cho luồng realtime từ HIS.
- Batch sync `/api/his/sync` đã đổi sang đọc DW làm nguồn chính.
- `source` của các bản ghi đồng bộ mới sẽ là `DW` để phân biệt với dữ liệu cũ từ `HIS`.
- `HealthPackage` hiện vẫn có thể mang `source = HIS` do DW guide chưa chỉ rõ bảng package tương ứng.
