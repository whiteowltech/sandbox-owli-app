// Perfil del usuario tal como lo arma el onboarding. Mismos identificadores que el
// dominio del backend (backend/internal/domain): sexo, actividad, dieta y restricciones.

export type Sex = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'cut' | 'maintain' | 'bulk' | 'recomp';
export type Pace = 'slow' | 'steady' | 'fast';
export type Diet = 'omnivore' | 'vegetarian' | 'pescetarian' | 'vegan' | 'keto' | 'paleo' | 'carnivore';
export type Restriction = 'gluten_free' | 'lactose_free';
export type UnitSystem = 'metric' | 'imperial';

export interface Profile {
  /** Opcional: Owli lo usa para saludar. */
  name: string;
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  pace: Pace;
  targetWeightKg: number;
  diet: Diet;
  restrictions: Restriction[];
  /** De 1 (OMAD) a 5. */
  mealsPerDay: number;
  /** Internamente todo es métrico; esto solo cambia cómo se muestra. */
  units: UnitSystem;
}
