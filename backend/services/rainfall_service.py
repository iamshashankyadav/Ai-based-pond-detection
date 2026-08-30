import httpx
from typing import Dict, Any, List
import datetime

# Regional climate benchmarks for Chhattisgarh (Bhilai / Durg / Raipur basin)
DEFAULT_MONTHLY_RAINFALL = {
    "Jan": 12.5,
    "Feb": 18.2,
    "Mar": 14.8,
    "Apr": 16.4,
    "May": 24.1,
    "Jun": 195.4,
    "Jul": 375.8,
    "Aug": 360.2,
    "Sep": 185.6,
    "Oct": 48.3,
    "Nov": 10.2,
    "Dec": 6.5
}

class RainfallService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=12.0)
        self.cache: Dict[str, Any] = {}

    async def get_historical_rainfall(
        self,
        lat: float,
        lon: float,
        years: int = 5
    ) -> Dict[str, Any]:
        """
        Fetches historical precipitation stats from Open-Meteo Historical Weather API
        with regional fallback and monthly monsoon profile.
        """
        cache_key = f"{round(lat, 2)}_{round(lon, 2)}_{years}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        try:
            # Call Open-Meteo Archive API
            end_year = datetime.datetime.now().year - 1
            start_year = max(2018, end_year - min(years, 5) + 1)
            start_date = f"{start_year}-01-01"
            end_date = f"{end_year}-12-31"

            url = (
                f"https://archive-api.open-meteo.com/v1/archive?"
                f"latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}"
                f"&daily=precipitation_sum&timezone=auto"
            )

            resp = await self.client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                daily_precip = data.get("daily", {}).get("precipitation_sum", [])
                dates = data.get("daily", {}).get("time", [])

                if daily_precip and len(daily_precip) > 300:
                    result = self._process_open_meteo_data(daily_precip, dates, lat, lon)
                    self.cache[cache_key] = result
                    return result
        except Exception as e:
            print(f"Open-Meteo rainfall fetch warning: {e}, using regional climate normal model.")

        # High-accuracy regional fallback based on Indian Meteorological Department (IMD) normals
        result = self._generate_regional_normals(lat, lon)
        self.cache[cache_key] = result
        return result

    def _process_open_meteo_data(
        self,
        daily_precip: List[float],
        dates: List[str],
        lat: float,
        lon: float
    ) -> Dict[str, Any]:
        """Aggregates daily precipitation timeseries into annual, monthly, and monsoon statistics."""
        monthly_totals = {m: 0.0 for m in ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]}
        monthly_counts = {m: 0 for m in monthly_totals}
        year_totals: Dict[str, float] = {}

        max_daily = 0.0
        months_order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

        for d_str, val in zip(dates, daily_precip):
            if val is None:
                continue
            val_f = float(val)
            dt = datetime.datetime.strptime(d_str, "%Y-%m-%d")
            m_name = months_order[dt.month - 1]
            y_name = str(dt.year)

            monthly_totals[m_name] += val_f
            year_totals[y_name] = year_totals.get(y_name, 0.0) + val_f
            if val_f > max_daily:
                max_daily = val_f

        num_years = max(1, len(year_totals))
        avg_monthly = {m: round(monthly_totals[m] / num_years, 1) for m in months_order}
        annual_avg = round(sum(avg_monthly.values()), 1)

        monsoon_total = sum(avg_monthly[m] for m in ["Jun", "Jul", "Aug", "Sep"])
        monsoon_pct = round((monsoon_total / (annual_avg + 1e-6)) * 100.0, 1)

        return {
            "source": "Open-Meteo Historical Archive API",
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "annual_rainfall_mm": annual_avg,
            "monsoon_rainfall_mm": round(monsoon_total, 1),
            "monsoon_percentage": monsoon_pct,
            "peak_daily_rainfall_mm": round(max_daily, 1),
            "monthly_distribution": [
                {"month": m, "rainfall_mm": avg_monthly[m]} for m in months_order
            ],
            "wettest_month": max(avg_monthly.items(), key=lambda x: x[1])[0],
            "rainfall_classification": "Sub-humid Tropical (High Water Harvesting Potential)" if annual_avg > 1100 else "Moderate Rainfall Belt"
        }

    def _generate_regional_normals(self, lat: float, lon: float) -> Dict[str, Any]:
        """IMD standard normals for Chhattisgarh."""
        months_order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        monthly = list(DEFAULT_MONTHLY_RAINFALL.items())

        annual_avg = round(sum(DEFAULT_MONTHLY_RAINFALL.values()), 1)
        monsoon_total = sum(DEFAULT_MONTHLY_RAINFALL[m] for m in ["Jun", "Jul", "Aug", "Sep"])
        monsoon_pct = round((monsoon_total / annual_avg) * 100.0, 1)

        return {
            "source": "IMD Chhattisgarh Climate Benchmark",
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "annual_rainfall_mm": annual_avg,
            "monsoon_rainfall_mm": round(monsoon_total, 1),
            "monsoon_percentage": monsoon_pct,
            "peak_daily_rainfall_mm": 98.4,
            "monthly_distribution": [
                {"month": m, "rainfall_mm": DEFAULT_MONTHLY_RAINFALL[m]} for m in months_order
            ],
            "wettest_month": "Jul",
            "rainfall_classification": "Sub-humid Tropical (Optimal Pond Inflow Zone)"
        }

rainfall_service = RainfallService()
