import { useParams } from "react-router-dom";
import { AppShell } from "../components/Layout";
import { ReportDashboard } from "../components/reports/ReportDashboard";
import { ReportFrameView } from "../components/reports/ReportFrameView";
import { ReportView } from "../components/reports/ReportView";

export function ReportsPage() {
  const { reportId, frameId } = useParams();

  return (
    <AppShell>
      {reportId && frameId ? (
        <ReportFrameView reportId={reportId} frameId={frameId} />
      ) : reportId ? (
        <ReportView reportId={reportId} />
      ) : (
        <ReportDashboard />
      )}
    </AppShell>
  );
}
