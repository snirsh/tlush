import type { TaxYearSpec } from "../types";
import { TAX_YEAR_2024 } from "./2024";
import { TAX_YEAR_2025 } from "./2025";
import { TAX_YEAR_2026 } from "./2026";

/** Every supported tax year. Adding a year is a new file plus one line here. */
export const TAX_YEAR_SPECS: readonly TaxYearSpec[] = [
  TAX_YEAR_2024,
  TAX_YEAR_2025,
  TAX_YEAR_2026,
];
