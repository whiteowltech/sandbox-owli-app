// Tipos de la API del diario (backend/internal/adapters/httpapi/diary.go).

export interface MacrosDto {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fiberG: number;
  fatG: number;
}

export interface FoodTraits {
  animalOrigin: boolean;
  plantOrigin: boolean;
  containsMeat: boolean;
  containsFish: boolean;
  containsGrain: boolean;
  containsLegume: boolean;
  containsDairy: boolean;
  containsAddedSugar: boolean;
  containsGluten: boolean;
  containsLactose: boolean;
  allergensVerified: boolean;
}

export interface Food {
  id: string;
  nameEs: string;
  nameEn: string;
  per100g: MacrosDto;
  traits: FoodTraits;
}

export interface Entry {
  id: string;
  foodId: string;
  nameEs: string;
  nameEn: string;
  grams: number;
  eatenAt: string;
  source: string;
  macros: MacrosDto;
}

export type OwliMood = 'energetic' | 'neutral' | 'tired' | 'satisfied';

export interface Day {
  date: string;
  entries: Entry[];
  totals: MacrosDto;
  plan: { dailyTarget: number; tdee: number };
  targets: { proteinG: number; carbsG: number; fatG: number; netCarbs: boolean };
  /** Calculado en el servidor con las reglas de domain.EvaluateMood y el ritmo del día. */
  mood: OwliMood;
}
