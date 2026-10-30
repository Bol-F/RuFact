import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ProfileSettings } from "@/components/ProfileSettings";

export const metadata: Metadata = {
  title: "RuFact · Profile and settings",
  description: "Manage your language, reading preferences, design, search topics and local check history.",
};

export default function ProfilePage() {
  return (
    <div className="paper-shell">
      <Header />
      <main><ProfileSettings /></main>
      <Footer />
    </div>
  );
}
