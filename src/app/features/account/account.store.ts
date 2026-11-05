import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { macroTargets, type MacroTargets } from '../../core/nutrition/macros';
import { planFor, RANGES, type Plan } from '../../core/nutrition/plan';
import type {
  ActivityLevel,
  Diet,
  Goal,
  Pace,
  Profile,
  Restriction,
  Sex,
  UnitSystem,
} from '../../core/profile/profile.model';
import { NAME_MAX_LENGTH, nextTargetWeight } from '../onboarding/onboarding.store';

/** Las partes del plan que se editan por separado. Se abre una a la vez. */
export type Section = 'body' | 'goal' | 'diet' | 'meals' | 'name';

export type AccountError = 'underage' | 'wrongDirectionCut' | 'wrongDirectionBulk';

export const MEALS_MIN = 1;
export const MEALS_MAX = 5;

interface AccountState {
  /** El perfil guardado, con el que se compara el borrador. */
  saved: Profile | null;
  /** Lo que el usuario está editando. Se guarda entero con "Guardar cambios". */
  draft: Profile | null;
  open: Section | null;
  /** true en cuanto el usuario ajusta el peso meta: desde ahí se respeta su valor. */
  targetTouched: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function sameProfile(a: Profile, b: Profile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Editor del plan en "Tu cuenta". Mismas reglas que el onboarding (edad mínima,
 * peso meta en la dirección del objetivo, mínimo calórico) y el mismo cálculo en
 * vivo: el usuario ve cómo cambia su objetivo antes de guardar.
 */
export const AccountStore = signalStore(
  withState<AccountState>({ saved: null, draft: null, open: null, targetTouched: true }),
  withComputed(({ saved, draft }) => {
    const planOf = (p: Profile | null): Plan | null => (p ? planFor(p) : null);
    const targetsOf = (p: Profile | null, plan: Plan | null): MacroTargets | null =>
      p && plan ? macroTargets(plan.dailyTarget, p.weightKg, p.goal, p.diet) : null;
    const plan = computed(() => planOf(draft()));
    const savedPlan = computed(() => planOf(saved()));
    const errors = computed<AccountError[]>(() => {
      const d = draft();
      if (!d) return [];
      const errs: AccountError[] = [];
      if (d.ageYears < RANGES.ageYears.min) errs.push('underage');
      if (plan()?.wrongDirection) errs.push(d.goal === 'cut' ? 'wrongDirectionCut' : 'wrongDirectionBulk');
      return errs;
    });
    return {
      plan,
      targets: computed(() => targetsOf(draft(), plan())),
      savedPlan,
      dirty: computed(() => {
        const s = saved();
        const d = draft();
        return !!s && !!d && !sameProfile(s, d);
      }),
      errors,
      hasPace: computed(() => draft()?.goal === 'cut' || draft()?.goal === 'bulk'),
    };
  }),
  withMethods((store) => {
    const edit = (changes: Partial<Profile>) => {
      const d = store.draft();
      if (d) patchState(store, { draft: { ...d, ...changes } });
    };
    return {
      /** Arranca con el perfil guardado. Se llama al entrar a la pantalla. */
      load(profile: Profile | null): void {
        patchState(store, { saved: profile, draft: profile, open: null, targetTouched: true });
      },
      toggle(section: Section): void {
        patchState(store, { open: store.open() === section ? null : section });
      },
      setName(name: string): void {
        edit({ name: name.slice(0, NAME_MAX_LENGTH) });
      },
      setSex(sex: Sex): void {
        edit({ sex });
      },
      setAge(ageYears: number): void {
        edit({ ageYears: clamp(Math.round(ageYears), 13, 99) });
      },
      setHeight(heightCm: number): void {
        edit({ heightCm: clamp(Math.round(heightCm), RANGES.heightCm.min, RANGES.heightCm.max) });
      },
      setWeight(weightKg: number): void {
        edit({ weightKg: clamp(Math.round(weightKg * 2) / 2, RANGES.weightKg.min, RANGES.weightKg.max) });
      },
      setActivity(activity: ActivityLevel): void {
        edit({ activity });
      },
      setGoal(goal: Goal): void {
        const d = store.draft();
        if (!d) return;
        // El peso meta guardado es del usuario: se respeta salvo que quede en la
        // dirección contraria al nuevo objetivo.
        edit({ goal, targetWeightKg: nextTargetWeight(goal, d.weightKg, d.targetWeightKg, store.targetTouched()) });
      },
      setPace(pace: Pace): void {
        edit({ pace });
      },
      setTargetWeight(targetWeightKg: number): void {
        edit({ targetWeightKg: clamp(Math.round(targetWeightKg * 2) / 2, RANGES.weightKg.min, RANGES.weightKg.max) });
        patchState(store, { targetTouched: true });
      },
      setDiet(diet: Diet): void {
        edit({ diet });
      },
      toggleRestriction(r: Restriction): void {
        const list = store.draft()?.restrictions ?? [];
        edit({ restrictions: list.includes(r) ? list.filter((x) => x !== r) : [...list, r] });
      },
      setMeals(mealsPerDay: number): void {
        edit({ mealsPerDay: clamp(Math.round(mealsPerDay), MEALS_MIN, MEALS_MAX) });
      },
      /** Las unidades son una preferencia de pantalla: se aplican ya, sin pasar por "Guardar". */
      unitsSaved(units: UnitSystem): void {
        const s = store.saved();
        const d = store.draft();
        patchState(store, { saved: s && { ...s, units }, draft: d && { ...d, units } });
      },
      discard(): void {
        patchState(store, { draft: store.saved(), open: null });
      },
      /** El perfil listo para guardar, o null si hay errores o nada cambió. */
      toSave(): Profile | null {
        const d = store.draft();
        if (!d || !store.dirty() || store.errors().length > 0) return null;
        return { ...d, name: d.name.trim() };
      },
      /** Después de guardar: el borrador pasa a ser lo guardado. */
      commit(profile: Profile): void {
        patchState(store, { saved: profile, draft: profile, open: null });
      },
    };
  }),
);
