import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SupportPageContent } from "@/components/SupportPageContent";
import { getSupportAvailability } from "@/lib/server/support";
import "./support.css";

export const metadata: Metadata = {
  title: "RuFact’ni qo‘llab-quvvatlash — Support RuFact",
  description: "RuFact loyihasini ixtiyoriy qo‘llab-quvvatlash va yordam berish yo‘llari.",
};

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="paper-shell">
      <Header />
      <main>
        <SupportPageContent availability={getSupportAvailability()} />
      </main>
      <Footer />
    </div>
  );
}
