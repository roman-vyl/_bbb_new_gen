import type { ReactNode } from "react";

import { ContextBar } from "@/shared/layout/ContextBar";
import { TabNav } from "@/shared/layout/TabNav";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <ContextBar />
      <TabNav />
      <main className="app-main">{children}</main>
    </div>
  );
}
