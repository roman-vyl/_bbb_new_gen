import type { ReactNode } from "react";

import { useWorkbenchShell } from "@/shared/context/WorkbenchContext";

export function WorkbenchGate({ children }: { children: ReactNode }) {
  const { reportLoadStatus, reportError, reloadReport } = useWorkbenchShell();

  if (reportLoadStatus === "loading") {
    return (
      <div className="workbench-gate">
        <p>Loading research run…</p>
      </div>
    );
  }

  if (reportLoadStatus === "error") {
    return (
      <div className="workbench-gate workbench-gate--error">
        <h2>Cannot load report</h2>
        <p>{reportError}</p>
        <button type="button" className="chip chip--active" onClick={reloadReport}>
          Retry
        </button>
      </div>
    );
  }

  return children;
}
