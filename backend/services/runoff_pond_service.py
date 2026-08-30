import math
from typing import Dict, Any, Optional

class RunoffPondService:
    """
    Runoff estimation models (Rational & SCS-CN) and Frustum
    Pond Sizing & Water Security Analytics Engine.
    """

    # Land cover runoff coefficients (C)
    LAND_COVER_COEFFICIENTS = {
        "agricultural_flat": 0.25,
        "cultivated_clay_loam": 0.35,
        "barren_soil": 0.50,
        "mixed_rural_vegetation": 0.30,
        "rocky_hilly": 0.65
    }

    # SCS Curve Numbers (CN)
    CURVE_NUMBERS = {
        "agricultural_flat": 75,
        "cultivated_clay_loam": 82,
        "barren_soil": 86,
        "mixed_rural_vegetation": 78,
        "rocky_hilly": 91
    }

    def estimate_runoff(
        self,
        catchment_area_m2: float,
        annual_rainfall_mm: float,
        land_use: str = "cultivated_clay_loam",
        custom_c: Optional[float] = None,
        monthly_distribution: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Calculates estimated runoff volume reaching the candidate pond site using
        both the Rational Method and SCS Curve Number (CN) Method.
        """
        c_coeff = custom_c if custom_c is not None else self.LAND_COVER_COEFFICIENTS.get(land_use, 0.35)
        cn = self.CURVE_NUMBERS.get(land_use, 80)

        # 1. Rational Method: Runoff Volume = C * Rainfall(m) * Area(m²)
        rainfall_m = annual_rainfall_mm / 1000.0
        rational_volume_m3 = c_coeff * rainfall_m * catchment_area_m2

        # 2. SCS Curve Number Method
        # Potential maximum retention S in mm
        s_mm = (25400.0 / cn) - 254.0
        if annual_rainfall_mm > 0.2 * s_mm:
            runoff_depth_mm = ((annual_rainfall_mm - 0.2 * s_mm)**2) / (annual_rainfall_mm + 0.8 * s_mm)
        else:
            runoff_depth_mm = 0.0
        scs_volume_m3 = (runoff_depth_mm / 1000.0) * catchment_area_m2

        # Composite recommended annual runoff
        annual_runoff_m3 = round((rational_volume_m3 + scs_volume_m3) / 2.0, 1)
        annual_runoff_ml = round(annual_runoff_m3 / 1000.0, 2) # Million Liters

        # Monthly runoff breakdown
        monthly_runoff = []
        if monthly_distribution:
            for item in monthly_distribution:
                m_name = item.get("month", "")
                m_rain = float(item.get("rainfall_mm", 0.0))
                m_vol_m3 = round(c_coeff * (m_rain / 1000.0) * catchment_area_m2, 1)
                monthly_runoff.append({
                    "month": m_name,
                    "rainfall_mm": m_rain,
                    "runoff_volume_m3": m_vol_m3,
                    "runoff_volume_ml": round(m_vol_m3 / 1000.0, 3)
                })

        return {
            "catchment_area_m2": catchment_area_m2,
            "catchment_area_ha": round(catchment_area_m2 / 10000.0, 2),
            "annual_rainfall_mm": annual_rainfall_mm,
            "runoff_coefficient_c": c_coeff,
            "curve_number_cn": cn,
            "annual_runoff_volume_m3": annual_runoff_m3,
            "annual_runoff_volume_million_liters": annual_runoff_ml,
            "rational_method_volume_m3": round(rational_volume_m3, 1),
            "scs_cn_method_volume_m3": round(scs_volume_m3, 1),
            "monthly_runoff_breakdown": monthly_runoff
        }

    def recommend_pond_sizing(
        self,
        annual_runoff_m3: float,
        catchment_area_m2: float,
        slope_percent: float = 2.5,
        target_capture_pct: float = 25.0
    ) -> Dict[str, Any]:
        """
        Sizes optimal trapezoidal frustum village pond dimensions based on harvestable
        runoff volume, site terrain slope, and seepage allowances.
        Frustum formula: V = (h / 3) * (A1 + A2 + sqrt(A1 * A2))
        """
        # Target storage is typically 20% - 35% of total annual runoff to maintain flush
        design_storage_m3 = annual_runoff_m3 * (target_capture_pct / 100.0)
        
        # Enforce realistic village pond bounds (e.g. 3,000 m³ to 60,000 m³)
        design_storage_m3 = max(2500.0, min(80000.0, design_storage_m3))

        # Recommended depth h:
        # Gentle terrain (<3%): 3.0m - 3.5m depth
        # Moderate terrain (3-6%): 2.5m - 3.0m depth
        if slope_percent < 3.0:
            depth_h = 3.2
        elif slope_percent < 6.0:
            depth_h = 2.8
        else:
            depth_h = 2.4

        # Side embankment slope z:1 (e.g., 1.5 horizontal to 1 vertical)
        side_slope_z = 1.5

        # Compute frustum dimensions:
        # Let top width = W, top length = L = 1.5 * W (rectangular aspect ratio 1.5:1)
        # Bottom width = W - 2*z*h, bottom length = L - 2*z*h
        # Iterative solver for W:
        low_w, high_w = 15.0, 300.0
        best_w = 40.0

        for _ in range(30):
            mid_w = (low_w + high_w) / 2.0
            mid_l = 1.5 * mid_w

            bot_w = max(5.0, mid_w - 2 * side_slope_z * depth_h)
            bot_l = max(5.0, mid_l - 2 * side_slope_z * depth_h)

            a1 = mid_w * mid_l
            a2 = bot_w * bot_l
            vol = (depth_h / 3.0) * (a1 + a2 + math.sqrt(a1 * a2))

            if vol < design_storage_m3:
                low_w = mid_w
            else:
                high_w = mid_w
            best_w = mid_w

        top_width = round(best_w, 1)
        top_length = round(1.5 * best_w, 1)
        bot_width = round(max(5.0, top_width - 2 * side_slope_z * depth_h), 1)
        bot_length = round(max(5.0, top_length - 2 * side_slope_z * depth_h), 1)

        top_surface_area_m2 = round(top_width * top_length, 1)
        bottom_bed_area_m2 = round(bot_width * bot_length, 1)
        actual_capacity_m3 = round(
            (depth_h / 3.0) * (top_surface_area_m2 + bottom_bed_area_m2 + math.sqrt(top_surface_area_m2 * bottom_bed_area_m2)),
            1
        )
        actual_capacity_ml = round(actual_capacity_m3 / 1000.0, 2) # Million Liters

        # Community water security metrics:
        # 1. Village population drinking/domestic days (assuming 1,200 people @ 45 L/day = 54 m³/day)
        village_domestic_days = round(actual_capacity_m3 * 0.70 / 54.0) # 30% evaporation/seepage allowance
        # 2. Livestock cattle days (assuming 400 cattle @ 40 L/day = 16 m³/day)
        livestock_days = round(actual_capacity_m3 * 0.70 / 16.0)
        # 3. Supplemental kharif/rabi irrigation area (assuming 150 mm supplemental irrigation depth)
        irrigation_hectares = round((actual_capacity_m3 * 0.75) / (150.0 * 10.0), 1)

        return {
            "recommended_depth_m": depth_h,
            "side_embankment_slope": f"1:{side_slope_z} (V:H)",
            "top_dimensions_m": {
                "length": top_length,
                "width": top_width,
                "surface_area_m2": top_surface_area_m2,
                "surface_area_ha": round(top_surface_area_m2 / 10000.0, 3)
            },
            "bottom_dimensions_m": {
                "length": bot_length,
                "width": bot_width,
                "bed_area_m2": bottom_bed_area_m2
            },
            "storage_capacity": {
                "volume_m3": actual_capacity_m3,
                "million_liters": actual_capacity_ml,
                "target_runoff_captured_percent": target_capture_pct
            },
            "community_impact": {
                "village_water_supply_days": village_domestic_days,
                "livestock_support_days": livestock_days,
                "supplemental_irrigation_ha": irrigation_hectares,
                "groundwater_recharge_potential": "High (Kharun Sub-basin Recharge)"
            }
        }

runoff_pond_service = RunoffPondService()
