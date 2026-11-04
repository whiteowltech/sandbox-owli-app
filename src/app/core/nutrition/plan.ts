// Espejo de backend/internal/domain/plan.go y biometrics.go para el cálculo en vivo
// del onboarding (se recalcula con cada toque, sin pasar por la red).
// Las dos implementaciones se prueban con el mismo archivo de casos:
// backend/internal/domain/testdata/plan_cases.json. Si cambia una regla, cambia en los dos lados.

import type { ActivityLevel, Goal, Pace, Sex } from '../profile/profile.model';

export const MIN_USER_AGE = 18;
export const MIN_HEALTHY_BMI = 18.5;

/** Rangos que acepta el dominio (Biometrics.Validate). */
export const RANGES = {
  ageYears: { min: MIN_USER_AGE, max: 120 },
  heightCm: { min: 120, max: 250 },
  weightKg: { min: 30, max: 350 },
} as const;

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

type PaceRates = Record<Pace, number>;

/** PROVISIONAL: mismos valores que DefaultGoalPolicy, pendientes de validar con un profesional. */
export const GOAL_POLICY = {
  kcalPerKgWeek: 1100,
  cut: { slow: 0.25, steady: 0.5, fast: 0.75 } satisfies PaceRates,
  bulk: { slow: 0.15, steady: 0.25, fast: 0.4 } satisfies PaceRates,
  recompDeficit: 200,
  tooSlowKgWeek: 0.1,
} as const;

export interface PlanInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  pace: Pace;
  targetWeightKg: number;
}

export interface Plan {
  tdee: number;
  dailyTarget: number;
  minSafe: number;
  clamped: boolean;
  weeklyRateKg: number;
  weeksToGoal: number | null;
  wrongDirection: boolean;
  tooSlow: boolean;
  targetBelowHealthyBmi: boolean;
}

/** Redondeo igual a math.Round de Go para valores positivos (0,5 hacia arriba). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function minSafeCalories(sex: Sex): number {
  return sex === 'male' ? 1500 : 1200;
}

/** Gasto diario (Mifflin-St Jeor × factor de actividad), redondeado. */
export function tdee(i: Pick<PlanInput, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'activity'>): number {
  const bmr = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears + (i.sex === 'male' ? 5 : -161);
  return roundHalfUp(bmr * ACTIVITY_FACTORS[i.activity]);
}

export function planFor(i: PlanInput): Plan {
  const base = tdee(i);
  let delta = 0;
  if (i.goal === 'recomp') delta = -GOAL_POLICY.recompDeficit;
  if (i.goal === 'cut') delta = -GOAL_POLICY.cut[i.pace] * GOAL_POLICY.kcalPerKgWeek;
  if (i.goal === 'bulk') delta = GOAL_POLICY.bulk[i.pace] * GOAL_POLICY.kcalPerKgWeek;

  const minSafe = minSafeCalories(i.sex);
  const raw = roundHalfUp(base + delta);
  const dailyTarget = Math.max(raw, minSafe);
  const weeklyRateKg = Math.abs(dailyTarget - base) / GOAL_POLICY.kcalPerKgWeek;
  const heightM = i.heightCm / 100;

  const plan: Plan = {
    tdee: base,
    dailyTarget,
    minSafe,
    clamped: raw < minSafe,
    weeklyRateKg,
    weeksToGoal: null,
    wrongDirection: false,
    tooSlow: false,
    targetBelowHealthyBmi: i.targetWeightKg < MIN_HEALTHY_BMI * heightM * heightM,
  };
  if (i.goal !== 'cut' && i.goal !== 'bulk') return plan;

  const diff = i.targetWeightKg - i.weightKg;
  if ((i.goal === 'cut' && diff >= 0) || (i.goal === 'bulk' && diff <= 0)) return { ...plan, wrongDirection: true };
  if (weeklyRateKg < GOAL_POLICY.tooSlowKgWeek) return { ...plan, tooSlow: true };
  return { ...plan, weeksToGoal: Math.abs(diff) / weeklyRateKg };
}

/** Fecha estimada a partir de hoy, sumando días de calendario (inmune a cambios de horario). */
export function etaDate(weeks: number, from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + Math.round(weeks * 7));
}
