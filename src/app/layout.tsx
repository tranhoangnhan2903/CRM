import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Clinic CRM – Quản lý phòng khám",
  description: "Hệ thống CRM phòng khám với quản lý hoa hồng giới thiệu & thực hiện dịch vụ",
  metadataBase: new URL(appUrl),
  applicationName: "Clinic CRM",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Clinic CRM – Quản lý phòng khám",
    description: "CRM phòng khám cho khách hàng, hóa đơn, thanh toán và hoa hồng.",
    url: appUrl,
    siteName: "Clinic CRM",
    locale: "vi_VN",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">Bỏ qua điều hướng và tới nội dung chính</a>
        <script
          id="clinic-crm-jsonld"
          type="application/ld+json"
          suppressHydrationWarning
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Clinic CRM",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            inLanguage: "vi-VN",
            description: "Nền tảng CRM phòng khám để quản lý khách hàng, vận hành và hoa hồng.",
            url: appUrl,
          })}
        </script>
        {children}
      </body>
    </html>
  );
}
