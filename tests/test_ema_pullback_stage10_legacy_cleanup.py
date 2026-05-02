from __future__ import annotations

from pathlib import Path


def test_no_active_legacy_references_in_ema_pullback_tree() -> None:
    root = Path(__file__).resolve().parents[1] / "research" / "strategies" / "ema_pullback"
    fp = "Feature" + "Profile"
    fr = "Feature" + "Relation"
    it = "intraday" + "_" + "trend"
    st = "swing" + "_" + "trend"
    vb = "ema_pullback_" + "baseline"
    vc = "ema_pullback_" + "conservative"
    va = "ema_pullback_" + "aggressive"
    vr = "ema_pullback_" + "20_200_500_reclaim"
    banned = (
        fp,
        fr,
        it,
        st,
        vb,
        vc,
        va,
        vr,
    )
    for path in root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for needle in banned:
            assert needle not in text, f"found legacy marker {needle!r} in {path}"
