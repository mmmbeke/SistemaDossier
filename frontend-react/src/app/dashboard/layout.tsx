import type { ReactNode } from "react";
import DashboardAuthGate from "./DashboardAuthGate";
import Sidebar from "@/components/dashboard/Sidebar";
import { DossierJobsProvider } from "@/providers/DossierJobsProvider";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardAuthGate>
      <DossierJobsProvider>
        <div className="flex min-h-screen" style={{ backgroundColor: "var(--bg-page)" }}>
          <Sidebar />
          <main className="ml-64 flex-1">
            <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
              {children}
            </div>
          </main>
        </div>
      </DossierJobsProvider>
    </DashboardAuthGate>
  );
}
