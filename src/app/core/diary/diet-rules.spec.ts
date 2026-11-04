import type { FoodTraits } from './diary.model';
import { dietPermits, restrictionConflicts } from './diet-rules';

const none: FoodTraits = {
  animalOrigin: false,
  plantOrigin: false,
  containsMeat: false,
  containsFish: false,
  containsGrain: false,
  containsLegume: false,
  containsDairy: false,
  containsAddedSugar: false,
  containsGluten: false,
  containsLactose: false,
  allergensVerified: true,
};
const t = (x: Partial<FoodTraits>): FoodTraits => ({ ...none, ...x });

// Mismos casos que backend/internal/domain/diet_test.go.
describe('dietPermits', () => {
  const steak = t({ animalOrigin: true, containsMeat: true });
  const salmon = t({ animalOrigin: true, containsFish: true });
  const rice = t({ plantOrigin: true, containsGrain: true });
  const salt = t({});
  const cheese = t({ animalOrigin: true, containsDairy: true, containsLactose: true });

  const cases = [
    ['carnivore', 'bife', steak, true],
    ['carnivore', 'sal', salt, true],
    ['carnivore', 'arroz', rice, false],
    ['vegan', 'arroz', rice, true],
    ['vegan', 'queso', cheese, false],
    ['vegetarian', 'queso', cheese, true],
    ['vegetarian', 'salmón', salmon, false],
    ['pescetarian', 'salmón', salmon, true],
    ['pescetarian', 'bife', steak, false],
    ['paleo', 'bife', steak, true],
    ['paleo', 'arroz', rice, false],
    ['paleo', 'queso', cheese, false],
    ['keto', 'arroz', rice, true],
    ['omnivore', 'bife', steak, true],
  ] as const;

  for (const [diet, name, food, want] of cases) {
    it(`${diet} / ${name} → ${want}`, () => {
      expect(dietPermits(diet, food)).toBe(want);
    });
  }
});

describe('restrictionConflicts', () => {
  it('solo marca lo que seguro contiene gluten o lactosa', () => {
    const bread = t({ plantOrigin: true, containsGrain: true, containsGluten: true });
    const milk = t({ animalOrigin: true, containsLactose: true });
    expect(restrictionConflicts(['gluten_free', 'lactose_free'], bread)).toEqual(['gluten_free']);
    expect(restrictionConflicts(['gluten_free', 'lactose_free'], milk)).toEqual(['lactose_free']);
    expect(restrictionConflicts([], bread)).toEqual([]);
  });
});
