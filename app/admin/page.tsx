import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />
      <AdminDashboard />
    </div>
  );
}
