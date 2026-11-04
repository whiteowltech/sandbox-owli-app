// Todo se guarda en sistema métrico; esto solo convierte para mostrar (regla de CLAUDE.md).

import type { UnitSystem } from '../profile/profile.model';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function formatWeight(kg: number, units: UnitSystem, locale: string): string {
  if (units === 'imperial') return `${Math.round(kg / KG_PER_LB)} lb`;
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kg);
  return `${n} kg`;
}

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const totalIn = Math.round(cm / CM_PER_IN);
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`;
}
