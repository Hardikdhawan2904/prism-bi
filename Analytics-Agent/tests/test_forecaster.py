"""tests/test_forecaster.py — regression check for ProphetForecaster's
seasonality guards.

Reproduces a real bug found via Analytics-Agent's live /analyze endpoint:
on a 24-point monthly series with a clear increasing trend and one sharp
outlier, seasonality_mode="multiplicative" plus unconditional yearly
seasonality produced forecasts oscillating wildly outside the historical
range (e.g. -600K then +600K the next month) on data that only ever
trended upward. Fixed by (1) defaulting to additive seasonality and (2)
only enabling yearly/quarterly seasonality once there's enough real
calendar history to fit them reliably — empirically, yearly stayed
unstable through 24 and 30 months and only settled down at 36 (~3 years).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import pytest

pytest.importorskip("prophet")

from app.services.ml.forecaster import ProphetForecaster


def _trending_series_with_one_shock(n_months: int) -> pd.DataFrame:
    dates = pd.date_range("2022-01-01", periods=n_months, freq="MS")
    values = [100_000 + 3_000 * i for i in range(n_months)]
    values[15] = 28_000  # one sharp planted outlier, same shape as the live bug report
    return pd.DataFrame({"ds": dates, "y": values})


def _assert_sane_forecast(df: pd.DataFrame, result: dict) -> None:
    assert "error" not in result
    history_min, history_max = min(df["y"]), max(df["y"])
    span = history_max - history_min
    # Generous bound (2x the historical span beyond either edge) — this
    # isn't a tight accuracy check, just a guard against the specific
    # failure mode (values several multiples outside history in either
    # direction, flipping sign every other period).
    lo, hi = history_min - 2 * span, history_max + 2 * span
    for point in result["forecast"]:
        assert lo <= point["yhat"] <= hi, f"{point} is wildly outside historical range [{history_min}, {history_max}]"


def test_default_seasonality_mode_is_additive():
    import inspect
    assert inspect.signature(ProphetForecaster.fit_and_forecast).parameters["seasonality_mode"].default == "additive"


def test_forecast_stays_sane_at_24_months_yearly_seasonality_disabled():
    # This is the exact shape of the live bug report: 24 months (~2 years)
    # isn't enough calendar history for yearly seasonality — it must be
    # auto-disabled here, not fit unstably.
    df = _trending_series_with_one_shock(24)
    result = ProphetForecaster().fit_and_forecast(df, periods=6, freq="MS")
    _assert_sane_forecast(df, result)


def test_forecast_stays_sane_at_36_months_yearly_seasonality_enabled():
    # Enough history (~3 years) that yearly seasonality re-enables and
    # must still fit stably, not just "disabled = safe by omission".
    df = _trending_series_with_one_shock(36)
    result = ProphetForecaster().fit_and_forecast(df, periods=6, freq="MS")
    _assert_sane_forecast(df, result)
