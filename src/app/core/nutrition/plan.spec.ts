// Mismos casos que backend/internal/domain/plan_test.go: garantizan que la app y el
// servidor calculen exactamente igual.
import shared from '../../../../../backend/internal/domain/testdata/plan_cases.json';

import { etaDate, planFor, tdee, type Plan, type PlanInput } from './plan';

interface SharedCase {
  name: string;
  input: PlanInput;
  want: Plan;
}

describe('planFor (casos compartidos con el backend)', () => {
  const cases = (shared as { cases: SharedCase[] }).cases;

  it('hay casos para comparar', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of cases) {
    it(c.name, () => {
      const got = planFor(c.input);
      const { weeksToGoal, weeklyRateKg, ...exact } = c.want;
      expect(got).toMatchObject(exact);
      expect(got.weeklyRateKg).toBeCloseTo(weeklyRateKg, 3);
      if (weeksToGoal === null) expect(got.weeksToGoal).toBeNull();
      else expect(got.weeksToGoal).toBeCloseTo(weeksToGoal, 3);
    });
  }
});

describe('tdee', () => {
  it('coincide con los ejemplos documentados en biometrics_test.go', () => {
    expect(tdee({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80, activity: 'moderate' })).toBe(2759);
    expect(tdee({ sex: 'female', ageYears: 25, heightCm: 165, weightKg: 60, activity: 'sedentary' })).toBe(1614);
    expect(tdee({ sex: 'male', ageYears: 45, heightCm: 175, weightKg: 95, activity: 'very_active' })).toBe(3465);
  });
});

describe('etaDate', () => {
  it('suma semanas redondeando a días', () => {
    const from = new Date(2026, 10, 3);
    expect(etaDate(12, from)).toEqual(new Date(2026, 10, 3 + 84));
  });
});
