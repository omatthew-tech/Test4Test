import { useParams } from "react-router-dom";
import { AppShell } from "../components/Layout";
import { ReportDashboard } from "../components/reports/ReportDashboard";
import { ReportView } from "../components/reports/ReportView";

export function ReportsPage() {
  const { reportId } = useParams();

  return (
    <AppShell>
      {reportId ? <ReportView reportId={reportId} /> : <ReportDashboard />}
    </AppShell>
  );
}
