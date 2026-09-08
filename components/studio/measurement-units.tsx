"use client";
import { createContext, useContext, type ReactNode } from "react";
import {
  measurementText,
  mmPerUnit,
  type MeasurementUnit,
} from "@/lib/embroidery/units";
const UnitContext = createContext<MeasurementUnit>("mm");
export function MeasurementProvider({
  unit,
  children,
}: {
  unit: MeasurementUnit;
  children: ReactNode;
}) {
  return <UnitContext.Provider value={unit}>{children}</UnitContext.Provider>;
}
export function measurements(unit: MeasurementUnit = "mm") {
  const number = (mm: number, digits?: number) =>
    measurementText(mm, unit, digits);
  return {
    unit,
    factor: mmPerUnit(unit),
    number,
    length: (mm: number) => `${number(mm)} ${unit}`,
    size: (w: number, h: number) => `${number(w)} × ${number(h)} ${unit}`,
    area: (mm2: number) =>
      `${Number((mm2 / mmPerUnit(unit) ** 2).toFixed(2))} ${unit}²`,
  };
}
export const useMeasurements = () => measurements(useContext(UnitContext));
