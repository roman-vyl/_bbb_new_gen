import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  assertSupportedReportSchema,
  type ChartBar,
  type RunReport,
  type RunVariant,
  type StrategyConfigDraft,
  type WorkbenchTab,
} from "@/api/types";
import candlesFixture from "@/fixtures/candles.json";
import configDraftFixture from "@/fixtures/config_draft.json";
import reportFixture from "@/fixtures/report.json";

type WorkbenchState = {
  symbol: string;
  timeframe: string;
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  report: RunReport;
  candles: ChartBar[];
  selectedVariantKey: string;
  setSelectedVariantKey: (key: string) => void;
  selectedTradeId: number | null;
  selectTrade: (tradeId: number | null) => void;
  selectedVariant: RunVariant;
  configDraft: StrategyConfigDraft;
  setConfigDraft: (draft: StrategyConfigDraft) => void;
};

const WorkbenchContext = createContext<WorkbenchState | null>(null);

function loadFixtureReport(): RunReport {
  const report = reportFixture as RunReport;
  assertSupportedReportSchema(report.report_schema_version);
  return report;
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("chart");
  const [report] = useState(loadFixtureReport);
  const [candles] = useState(() => candlesFixture as ChartBar[]);
  const [configDraft, setConfigDraft] = useState(
    () => configDraftFixture as StrategyConfigDraft,
  );

  const defaultVariant = report.variants[0]?.variant ?? "";
  const [selectedVariantKey, setSelectedVariantKey] = useState(defaultVariant);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  const selectedVariant = useMemo(() => {
    const found = report.variants.find((v) => v.variant === selectedVariantKey);
    return found ?? report.variants[0];
  }, [report.variants, selectedVariantKey]);

  const selectTrade = useCallback((tradeId: number | null) => {
    setSelectedTradeId(tradeId);
    if (tradeId !== null) {
      setActiveTab("chart");
    }
  }, []);

  const value = useMemo<WorkbenchState>(
    () => ({
      symbol: report.symbol,
      timeframe: report.timeframe,
      activeTab,
      setActiveTab,
      report,
      candles,
      selectedVariantKey,
      setSelectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      configDraft,
      setConfigDraft,
    }),
    [
      report,
      activeTab,
      candles,
      selectedVariantKey,
      selectedTradeId,
      selectTrade,
      selectedVariant,
      configDraft,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchState {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) {
    throw new Error("useWorkbench must be used within WorkbenchProvider");
  }
  return ctx;
}
