import { ChartPanel } from "@/features/chart/ChartPanel";
import { ComposerPanel } from "@/features/composer/ComposerPanel";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { AppLayout } from "@/shared/layout/AppLayout";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

export function App() {
  const { activeTab } = useWorkbench();

  return (
    <AppLayout>
      {activeTab === "chart" && <ChartPanel />}
      {activeTab === "composer" && <ComposerPanel />}
      {activeTab === "reports" && <ReportsPanel />}
    </AppLayout>
  );
}
