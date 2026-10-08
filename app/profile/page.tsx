import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProfileView from "@/components/ProfileView";

export const metadata: Metadata = {
  title: "My Profile",
  description: "View your CBT-Practice subscription status, practice history and bookmarks.",
};

export default function ProfilePage() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />
      <ProfileView />
      <SiteFooter />
    </div>
  );
}
