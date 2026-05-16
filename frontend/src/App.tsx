import { ChartPanel } from "@/features/chart/ChartPanel";
import { ComposerPanel } from "@/features/composer/ComposerPanel";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { AppLayout } from "@/shared/layout/AppLayout";
import { WorkbenchGate } from "@/shared/layout/WorkbenchGate";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

function WorkbenchTabs() {
  const { activeTab } = useWorkbench();

  return (
    <>
      {activeTab === "chart" && <ChartPanel />}
      {activeTab === "composer" && <ComposerPanel />}
      {activeTab === "reports" && <ReportsPanel />}
    </>
  );
}

export function App() {
  return (
    <AppLayout>
      <WorkbenchGate>
        <WorkbenchTabs />
      </WorkbenchGate>
    </AppLayout>
  );
}
