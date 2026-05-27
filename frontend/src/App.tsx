import { ChartPanel } from "@/features/chart/ChartPanel";
import { ComposerPanel } from "@/features/composer/ComposerPanel";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { AppLayout } from "@/shared/layout/AppLayout";
import { WorkbenchGate } from "@/shared/layout/WorkbenchGate";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

function ReportBackedTabs() {
  const { activeTab } = useWorkbench();

  return (
    <>
      <div className="workbench-tab-pane" hidden={activeTab !== "chart"}>
        <ChartPanel />
      </div>
      {activeTab === "reports" && <ReportsPanel />}
    </>
  );
}

function WorkbenchTabs() {
  const { activeTab } = useWorkbench();

  if (activeTab === "composer") {
    return <ComposerPanel />;
  }

  return (
    <WorkbenchGate>
      <ReportBackedTabs />
    </WorkbenchGate>
  );
}

export function App() {
  return (
    <AppLayout>
      <WorkbenchTabs />
    </AppLayout>
  );
}
