import { describe, expect, it } from "vitest";
import type { ValidationErrorItem } from "../../api/types";
import {
  anyInstanceMetaHasError,
  COMPOSER_DEFAULT_EXPERIMENT_ID,
  createBlankConfigDraft,
  errorsForInstanceMeta,
  errorsForPath,
} from "./composerDraft";

function err(path: string): ValidationErrorItem {
  return { path, message: path };
}

describe("createBlankConfigDraft", () => {
  it("uses non-empty experiment_id and canonical reclaim_anchor trigger", () => {
    const draft = createBlankConfigDraft();
    expect(draft.experiment_id).toBe(COMPOSER_DEFAULT_EXPERIMENT_ID);
    expect(draft.experiment_id.trim().length).toBeGreaterThan(0);
    const strategy = draft.instances[0]?.strategy as {
      setups?: { component_id: string }[];
      trigger?: { component_id: string; lookback: number };
    };
    expect(strategy?.setups?.[0]).toMatchObject({
      component_id: "untouched_anchor_setup",
    });
    expect(strategy?.trigger).toEqual({
      component_id: "reclaim_anchor",
      lookback: 1,
    });
    const blockers = (strategy as { blockers?: { component_id: string }[] } | undefined)?.blockers;
    expect(blockers?.[0]).toMatchObject({ component_id: "no_blockers" });
  });
});

describe("errorsForInstanceMeta", () => {
  it("includes instance_id and variant only", () => {
    const errors = [
      err("instances[0].instance_id"),
      err("instances[0].variant"),
      err("instances[0].market.symbol"),
      err("instances[0].strategy.setup.component_id"),
      err("instances[1].variant"),
    ];
    expect(errorsForInstanceMeta(errors, 0).map((e) => e.path)).toEqual([
      "instances[0].instance_id",
      "instances[0].variant",
    ]);
    expect(errorsForInstanceMeta(errors, 1).map((e) => e.path)).toEqual(["instances[1].variant"]);
  });

  it("does not match instance_id prefix on other field names", () => {
    const errors = [err("instances[0].instance_id_extra")];
    expect(errorsForInstanceMeta(errors, 0)).toEqual([]);
  });
});

describe("anyInstanceMetaHasError", () => {
  it("is false when only non-meta instance paths fail", () => {
    const errors = [err("instances[0].strategy.blockers[0].component_id")];
    expect(anyInstanceMetaHasError(errors, 1)).toBe(false);
  });

  it("is true when any instance has meta field errors", () => {
    const errors = [err("instances[2].variant")];
    expect(anyInstanceMetaHasError(errors, 3)).toBe(true);
  });
});

describe("errorsForPath vs instance root", () => {
  it("instance root prefix matches nested market/strategy errors", () => {
    const errors = [err("instances[0].market.symbol")];
    expect(errorsForPath(errors, "instances[0]").length).toBe(1);
    expect(errorsForInstanceMeta(errors, 0).length).toBe(0);
  });
});
