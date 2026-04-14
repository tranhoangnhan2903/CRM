import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/dashboard",
    "/dashboard/me",
    "/dashboard/customers",
    "/dashboard/leads",
    "/dashboard/referrals",
    "/dashboard/services",
    "/dashboard/bills",
    "/dashboard/payments",
    "/dashboard/commissions",
    "/dashboard/policies",
    "/dashboard/users",
    "/dashboard/departments",
    "/dashboard/audit",
    "/dashboard/executor-tiers",
  ];

  return routes.map((route) => ({
    url: `${appUrl}${route}`,
    lastModified: new Date(),
  }));
}
