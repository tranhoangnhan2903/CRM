import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");
  const payoutMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // 1. Roles
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN", description: "System administrator" },
  });
  const doctorRole = await prisma.role.upsert({
    where: { name: "DOCTOR" },
    update: {},
    create: { name: "DOCTOR", description: "Doctor / Service provider" },
  });
  const receptionistRole = await prisma.role.upsert({
    where: { name: "RECEPTIONIST" },
    update: {},
    create: { name: "RECEPTIONIST", description: "Front desk / Receptionist" },
  });
  const accountantRole = await prisma.role.upsert({
    where: { name: "ACCOUNTANT" },
    update: {},
    create: { name: "ACCOUNTANT", description: "Accountant / Finance" },
  });
  const managerRole = await prisma.role.upsert({
    where: { name: "MANAGER" },
    update: {},
    create: { name: "MANAGER", description: "Manager / Operations overview" },
  });
  const salesRole = await prisma.role.upsert({
    where: { name: "SALES" },
    update: {},
    create: { name: "SALES", description: "Sales / Business development" },
  });

  // 2. Departments
  const generalDept = await prisma.department.upsert({
    where: { name: "Khoa Tổng quát" },
    update: {},
    create: { name: "Khoa Tổng quát", description: "General Medicine" },
  });
  const dermatologyDept = await prisma.department.upsert({
    where: { name: "Khoa Da liễu" },
    update: {},
    create: { name: "Khoa Da liễu", description: "Dermatology" },
  });
  const dentalDept = await prisma.department.upsert({
    where: { name: "Khoa Nha" },
    update: {},
    create: { name: "Khoa Nha", description: "Dental" },
  });

  // 3. Users
  const hash = await bcrypt.hash("Admin@123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "Quản trị viên",
      roleId: adminRole.id,
      departmentId: generalDept.id,
    },
    create: {
      email: "admin@clinic.local",
      passwordHash: hash,
      fullName: "Quản trị viên",
      roleId: adminRole.id,
      departmentId: generalDept.id,
    },
  });

  const doctor1 = await prisma.user.upsert({
    where: { email: "doctor1@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "BS. Nguyễn Văn A",
      roleId: doctorRole.id,
      departmentId: generalDept.id,
    },
    create: {
      email: "doctor1@clinic.local",
      passwordHash: hash,
      fullName: "BS. Nguyễn Văn A",
      roleId: doctorRole.id,
      departmentId: generalDept.id,
    },
  });

  const doctor2 = await prisma.user.upsert({
    where: { email: "doctor2@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "BS. Trần Thị B",
      roleId: doctorRole.id,
      departmentId: dermatologyDept.id,
    },
    create: {
      email: "doctor2@clinic.local",
      passwordHash: hash,
      fullName: "BS. Trần Thị B",
      roleId: doctorRole.id,
      departmentId: dermatologyDept.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "receptionist@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "Lễ tân Nguyễn C",
      roleId: receptionistRole.id,
      departmentId: generalDept.id,
    },
    create: {
      email: "receptionist@clinic.local",
      passwordHash: hash,
      fullName: "Lễ tân Nguyễn C",
      roleId: receptionistRole.id,
      departmentId: generalDept.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "accountant@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "KT. Phạm D",
      roleId: accountantRole.id,
      departmentId: null,
    },
    create: {
      email: "accountant@clinic.local",
      passwordHash: hash,
      fullName: "KT. Phạm D",
      roleId: accountantRole.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "manager@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "QL. Vận hành",
      roleId: managerRole.id,
      departmentId: generalDept.id,
    },
    create: {
      email: "manager@clinic.local",
      passwordHash: hash,
      fullName: "QL. Vận hành",
      roleId: managerRole.id,
      departmentId: generalDept.id,
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: "sales@clinic.local" },
    update: {
      passwordHash: hash,
      fullName: "KD. Lê Văn E",
      roleId: salesRole.id,
      departmentId: null,
    },
    create: {
      email: "sales@clinic.local",
      passwordHash: hash,
      fullName: "KD. Lê Văn E",
      roleId: salesRole.id,
    },
  });

  // 4. Services
  const svc1 = await prisma.service.upsert({
    where: { code: "KSK001" },
    update: {},
    create: {
      code: "KSK001",
      name: "Khám sức khỏe tổng quát",
      price: 500000,
      departmentId: generalDept.id,
    },
  });
  const svc2 = await prisma.service.upsert({
    where: { code: "DL001" },
    update: {},
    create: {
      code: "DL001",
      name: "Điều trị mụn",
      price: 1200000,
      departmentId: dermatologyDept.id,
    },
  });
  const svc3 = await prisma.service.upsert({
    where: { code: "NHA001" },
    update: {},
    create: {
      code: "NHA001",
      name: "Trám răng",
      price: 300000,
      departmentId: dentalDept.id,
    },
  });
  const svc4 = await prisma.service.upsert({
    where: { code: "DL002" },
    update: {},
    create: {
      code: "DL002",
      name: "Peel da chuyên sâu",
      price: 2500000,
      departmentId: dermatologyDept.id,
    },
  });

  // 5. Commission Policies
  await prisma.commissionPolicy.deleteMany();
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng giới thiệu mặc định",
      type: "REFERRAL",
      valueType: "PERCENTAGE",
      value: 5,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng giới thiệu Da liễu",
      type: "REFERRAL",
      valueType: "PERCENTAGE",
      value: 8,
      departmentId: dermatologyDept.id,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng thực hiện mặc định",
      type: "EXECUTOR",
      valueType: "PERCENTAGE",
      value: 10,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng chỉ định mặc định",
      type: "INDICATION",
      valueType: "PERCENTAGE",
      value: 3,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng giới thiệu stage mặc định",
      type: "STAGE_REFERRAL",
      valueType: "PERCENTAGE",
      value: 2,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng thực hiện Peel da",
      type: "EXECUTOR",
      valueType: "PERCENTAGE",
      value: 15,
      serviceId: svc4.id,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await prisma.commissionPolicy.create({
    data: {
      name: "Hoa hồng cố định bill lớn",
      type: "REFERRAL",
      valueType: "FIXED",
      value: 500000,
      minBillSize: 5000000,
      effectiveFrom: new Date("2026-01-01"),
    },
  });

  // 6. Sample customers
  const cust1 = await prisma.customer.upsert({
    where: { phone: "0988001122" },
    update: {
      fullName: "KH Test 4 Stage",
      email: "test4stage@clinic.local",
      address: "Quận 1, TP.HCM",
      yearOfBirth: 1992,
      gender: "FEMALE",
    },
    create: {
      fullName: "KH Test 4 Stage",
      phone: "0988001122",
      email: "test4stage@clinic.local",
      address: "Quận 1, TP.HCM",
      yearOfBirth: 1992,
      gender: "FEMALE",
    },
  });
  const cust2 = await prisma.customer.upsert({
    where: { phone: "0907654321" },
    update: {
      yearOfBirth: 1994,
      gender: "FEMALE",
    },
    create: {
      fullName: "Trần Thị Khách 2",
      phone: "0907654321",
      email: "khach2@gmail.com",
      yearOfBirth: 1994,
      gender: "FEMALE",
    },
  });

  // 7. Sample referral
  await prisma.referral.create({
    data: {
      referrerId: sales.id,
      referredCustomerId: cust1.id,
      status: "SUCCESS",
    },
  });

  // 8. Sample lead
  await prisma.lead.create({
    data: {
      customerId: cust2.id,
      source: "Facebook",
      status: "NEW",
      notes: "Khách hỏi về dịch vụ da liễu",
    },
  });

  const existingJourneyBills = await prisma.bill.count({
    where: { customerId: cust1.id },
  });

  if (existingJourneyBills === 0) {
    const createStage = async ({
      stageNo,
      previousBillId = null,
      service,
      executor,
      quantity = 1,
    }: {
      stageNo: number;
      previousBillId?: string | null;
      service: { id: string; code: string; price: number };
      executor: { id: string };
      quantity?: number;
    }) => {
      const totalAmount = service.price * quantity;
      const bill = await prisma.bill.create({
        data: {
          customerId: cust1.id,
          totalAmount,
          status: "PAID",
          stageNo,
          previousBillId,
          payoutRequestStatus: "NONE",
        },
      });

      const order = await prisma.serviceOrder.create({
        data: {
          billId: bill.id,
          serviceId: service.id,
          executorId: executor.id,
          quantity,
          price: service.price,
          status: "COMPLETED",
        },
      });

      await prisma.payment.create({
        data: {
          billId: bill.id,
          amount: totalAmount,
          method: stageNo % 2 === 0 ? "TRANSFER" : "CASH",
          status: "SUCCESS",
        },
      });

      const rate = service.code === "DL002" ? 15 : 10;
      await prisma.commission.create({
        data: {
          type: "EXECUTOR",
          amount: Math.round(totalAmount * rate) / 100,
          status: "PENDING_APPROVAL",
          payoutMonth,
          billId: bill.id,
          serviceOrderId: order.id,
          userId: executor.id,
        },
      });

      return bill;
    };

    const stage1 = await createStage({ stageNo: 1, service: svc1, executor: doctor1 });
    const stage2 = await createStage({ stageNo: 2, previousBillId: stage1.id, service: svc2, executor: doctor2 });
    const stage3 = await createStage({ stageNo: 3, previousBillId: stage2.id, service: svc4, executor: doctor2 });
    await createStage({ stageNo: 4, previousBillId: stage3.id, service: svc1, executor: doctor1 });
  }

  console.log("✅ Seed complete!");
  console.log("   Admin login: admin@clinic.local / Admin@123!");
  console.log(`   Users created: admin, doctor1, doctor2, receptionist, accountant, sales`);
  console.log(`   Services: ${svc1.name}, ${svc2.name}, ${svc3.name}, ${svc4.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
