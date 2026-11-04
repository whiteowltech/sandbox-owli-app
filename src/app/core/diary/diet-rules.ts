// Espejo de DietType.Permits y Restriction.Permits (backend/internal/domain/diet.go).
// En el registro manual solo se usa para AVISAR: lo que el usuario comió se anota
// igual. Las sugerencias, en cambio, nunca deben incluir algo no permitido.

import type { Diet, Restriction } from '../profile/profile.model';

import type { FoodTraits } from './diary.model';

export function dietPermits(diet: Diet, t: FoodTraits): boolean {
  switch (diet) {
    case 'carnivore':
      return !t.plantOrigin;
    case 'vegan':
      return !t.animalOrigin;
    case 'vegetarian':
      return !t.containsMeat && !t.containsFish;
    case 'pescetarian':
      return !t.containsMeat;
    case 'paleo':
      return !t.containsGrain && !t.containsLegume && !t.containsDairy && !t.containsAddedSugar;
    case 'keto':
    case 'omnivore':
      return true;
  }
}

/** Restricciones que el alimento incumple con seguridad (contiene gluten o lactosa). */
export function restrictionConflicts(restrictions: Restriction[], t: FoodTraits): Restriction[] {
  return restrictions.filter((r) => (r === 'gluten_free' ? t.containsGluten : t.containsLactose));
}
