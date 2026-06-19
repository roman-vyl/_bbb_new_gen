import { useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import type { WorkbenchTab } from "@/api/types";

const TABS: { id: WorkbenchTab; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "composer", label: "Strategy Composer" },
  { id: "reports", label: "Reports" },
];

export function TabNav() {
  const { activeTab, setActiveTab } = useWorkbenchShell();

  return (
    <nav className="tab-nav" aria-label="Workbench sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? "tab-nav__btn tab-nav__btn--active" : "tab-nav__btn"}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
