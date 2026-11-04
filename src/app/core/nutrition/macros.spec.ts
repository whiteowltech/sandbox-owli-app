// Mismos casos que backend/internal/domain/macro_split_test.go.
import shared from '../../../../../backend/internal/domain/testdata/macro_cases.json';
import type { Diet, Goal } from '../profile/profile.model';

import { macroTargets, type MacroTargets } from './macros';

interface SharedCase {
  name: string;
  input: { dailyKcal: number; weightKg: number; goal: Goal; diet: Diet };
  want: MacroTargets;
}

describe('macroTargets (casos compartidos con el backend)', () => {
  const cases = (shared as { cases: SharedCase[] }).cases;

  it('hay casos para comparar', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  for (const c of cases) {
    it(c.name, () => {
      const { dailyKcal, weightKg, goal, diet } = c.input;
      expect(macroTargets(dailyKcal, weightKg, goal, diet)).toEqual(c.want);
    });
  }
});
