// Espejo de backend/internal/domain/macro_split.go, para mostrar los objetivos
// aunque el servidor todavía no haya respondido. Se prueba con los mismos casos:
// backend/internal/domain/testdata/macro_cases.json.

import type { Diet, Goal } from '../profile/profile.model';

export interface MacroTargets {
  proteinG: number;
  carbsG: number; // en keto, carbos netos
  fatG: number;
  netCarbs: boolean;
}

/** PROVISIONAL: mismos valores que DefaultMacroSplit, pendientes de validar con un profesional. */
export const MACRO_SPLIT = {
  proteinPerKg: { cut: 2.0, maintain: 1.6, bulk: 1.8, recomp: 2.0 } satisfies Record<Goal, number>,
  maxProteinShare: 0.35,
  minFatShare: 0.25,
  ketoNetCarbsG: 20,
} as const;

const roundHalfUp = (x: number) => Math.floor(x + 0.5);

export function macroTargets(dailyKcal: number, weightKg: number, goal: Goal, diet: Diet): MacroTargets {
  const protein = Math.min(MACRO_SPLIT.proteinPerKg[goal] * weightKg, (MACRO_SPLIT.maxProteinShare * dailyKcal) / 4);
  const rest = dailyKcal - protein * 4;
  let carbs: number;
  let fat: number;
  let netCarbs = false;
  if (diet === 'keto') {
    carbs = MACRO_SPLIT.ketoNetCarbsG;
    fat = Math.max(0, (rest - carbs * 4) / 9);
    netCarbs = true;
  } else if (diet === 'carnivore') {
    carbs = 0;
    fat = Math.max(0, rest / 9);
  } else {
    fat = (MACRO_SPLIT.minFatShare * dailyKcal) / 9;
    carbs = (rest - fat * 9) / 4;
    if (carbs < 0) {
      carbs = 0;
      fat = Math.max(0, rest / 9);
    }
  }
  return { proteinG: roundHalfUp(protein), carbsG: roundHalfUp(carbs), fatG: roundHalfUp(fat), netCarbs };
}
