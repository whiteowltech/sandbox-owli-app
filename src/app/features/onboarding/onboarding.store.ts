import { computed } from '@angular/core';
import { patchState, signalStore, watchState, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';

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

export const STEPS = ['hello', 'body', 'goal', 'diet', 'ready'] as const;
export type Step = (typeof STEPS)[number];

/** Errores que bloquean el avance. El botón nunca se deshabilita: al tocarlo se muestran. */
export type OnboardingError = 'sexRequired' | 'underage' | 'wrongDirectionCut' | 'wrongDirectionBulk' | 'dietRequired';

/** La edad se puede bajar de 18 para poder explicar por qué no se permite. */
export const AGE_INPUT_MIN = 13;
export const NAME_MAX_LENGTH = 40;

export interface OnboardingState {
  step: Step;
  name: string;
  sex: Sex | null;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  pace: Pace;
  targetWeightKg: number;
  /** true en cuanto el usuario ajusta el peso meta: desde ahí se respeta su valor. */
  targetTouched: boolean;
  diet: Diet | null;
  restrictions: Restriction[];
  /** De 1 (OMAD) a 5: define cómo se reparte lo que falta en las sugerencias. */
  mealsPerDay: number;
  units: UnitSystem;
  /** Se activa al intentar avanzar con errores. */
  showErrors: boolean;
}

// Valores típicos para ajustar, no un formulario vacío. El sexo no se presupone.
export const INITIAL_STATE: OnboardingState = {
  step: 'hello',
  name: '',
  sex: null,
  ageYears: 30,
  heightCm: 170,
  weightKg: 75,
  activity: 'moderate',
  goal: 'cut',
  pace: 'steady',
  targetWeightKg: 70,
  targetTouched: false,
  diet: null,
  restrictions: [],
  mealsPerDay: 3,
  units: 'metric',
  showErrors: false,
};

const DRAFT_KEY = 'owli:onboarding-draft:v1';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Peso meta sugerido según el objetivo: 7 % menos para perder grasa, 5 % más para ganar músculo. */
export function suggestedTargetWeight(goal: Goal, weightKg: number): number {
  const factor = goal === 'cut' ? 0.93 : goal === 'bulk' ? 1.05 : 1;
  return Math.round(weightKg * factor * 2) / 2;
}

/**
 * Peso meta al cambiar de objetivo o de peso. Si el usuario no lo tocó, se sugiere uno
 * nuevo; si lo tocó, se respeta salvo que quede en la dirección contraria al objetivo.
 */
export function nextTargetWeight(goal: Goal, weightKg: number, current: number, touched: boolean): number {
  if (!touched) return suggestedTargetWeight(goal, weightKg);
  if (goal === 'cut' && current >= weightKg) return suggestedTargetWeight(goal, weightKg);
  if (goal === 'bulk' && current <= weightKg) return suggestedTargetWeight(goal, weightKg);
  return current;
}

function loadDraft(): Partial<OnboardingState> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<OnboardingState>) : null;
  } catch {
    return null;
  }
}

function saveDraft(state: OnboardingState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    /* sin borrador: si se cierra la app, se empieza de nuevo */
  }
}

export function clearOnboardingDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nada que borrar */
  }
}

/** Estado del onboarding de 3 pasos. Vive solo mientras dura el flujo. */
export const OnboardingStore = signalStore(
  withState<OnboardingState>(INITIAL_STATE),
  withComputed((s) => {
    const plan = computed<Plan | null>(() => {
      const sex = s.sex();
      if (!sex) return null;
      return planFor({
        sex,
        ageYears: Math.max(s.ageYears(), RANGES.ageYears.min),
        heightCm: s.heightCm(),
        weightKg: s.weightKg(),
        activity: s.activity(),
        goal: s.goal(),
        pace: s.pace(),
        targetWeightKg: s.targetWeightKg(),
      });
    });
    const stepErrors = computed<OnboardingError[]>(() => {
      switch (s.step()) {
        case 'body': {
          const errs: OnboardingError[] = [];
          if (!s.sex()) errs.push('sexRequired');
          if (s.ageYears() < RANGES.ageYears.min) errs.push('underage');
          return errs;
        }
        case 'goal':
          if (!plan()?.wrongDirection) return [];
          return [s.goal() === 'cut' ? 'wrongDirectionCut' : 'wrongDirectionBulk'];
        case 'diet':
          return s.diet() ? [] : ['dietRequired'];
        default:
          return [];
      }
    });
    return {
      stepNumber: computed(() => STEPS.indexOf(s.step())),
      plan,
      stepErrors,
      visibleErrors: computed(() => (s.showErrors() ? stepErrors() : [])),
      hasPace: computed(() => s.goal() === 'cut' || s.goal() === 'bulk'),
      greetingName: computed(() => s.name().trim()),
    };
  }),
  withMethods((store) => ({
    setName(name: string): void {
      patchState(store, { name: name.slice(0, NAME_MAX_LENGTH) });
    },
    setSex(sex: Sex): void {
      patchState(store, { sex });
    },
    setAge(ageYears: number): void {
      patchState(store, { ageYears: clamp(Math.round(ageYears), AGE_INPUT_MIN, 99) });
    },
    setHeight(heightCm: number): void {
      patchState(store, { heightCm: clamp(Math.round(heightCm), RANGES.heightCm.min, RANGES.heightCm.max) });
    },
    setWeight(weightKg: number): void {
      patchState(store, { weightKg: clamp(Math.round(weightKg * 2) / 2, RANGES.weightKg.min, RANGES.weightKg.max) });
    },
    setActivity(activity: ActivityLevel): void {
      patchState(store, { activity });
    },
    setGoal(goal: Goal): void {
      patchState(store, {
        goal,
        targetWeightKg: nextTargetWeight(goal, store.weightKg(), store.targetWeightKg(), store.targetTouched()),
      });
    },
    setPace(pace: Pace): void {
      patchState(store, { pace });
    },
    setTargetWeight(targetWeightKg: number): void {
      patchState(store, {
        targetWeightKg: clamp(Math.round(targetWeightKg * 2) / 2, RANGES.weightKg.min, RANGES.weightKg.max),
        targetTouched: true,
      });
    },
    setDiet(diet: Diet): void {
      patchState(store, { diet });
    },
    toggleRestriction(r: Restriction): void {
      const list = store.restrictions();
      patchState(store, { restrictions: list.includes(r) ? list.filter((x) => x !== r) : [...list, r] });
    },
    setMeals(mealsPerDay: number): void {
      patchState(store, { mealsPerDay: clamp(Math.round(mealsPerDay), 1, 5) });
    },
    setUnits(units: UnitSystem): void {
      patchState(store, { units });
    },
    /** Avanza si el paso actual es válido. Devuelve false y muestra los errores si no. */
    next(): boolean {
      if (store.stepErrors().length > 0) {
        patchState(store, { showErrors: true });
        return false;
      }
      const i = STEPS.indexOf(store.step());
      if (store.step() === 'body') {
        // Con el peso real ya cargado, el peso meta por defecto se acomoda a él.
        patchState(store, {
          targetWeightKg: nextTargetWeight(
            store.goal(),
            store.weightKg(),
            store.targetWeightKg(),
            store.targetTouched(),
          ),
        });
      }
      patchState(store, { step: STEPS[Math.min(i + 1, STEPS.length - 1)], showErrors: false });
      return true;
    },
    back(): void {
      const i = STEPS.indexOf(store.step());
      patchState(store, { step: STEPS[Math.max(i - 1, 0)], showErrors: false });
    },
    /** El perfil final. Solo es válido en el paso "ready". */
    toProfile(): Profile | null {
      const sex = store.sex();
      const diet = store.diet();
      if (store.step() !== 'ready' || !sex || !diet) return null;
      return {
        name: store.name().trim(),
        sex,
        ageYears: store.ageYears(),
        heightCm: store.heightCm(),
        weightKg: store.weightKg(),
        activity: store.activity(),
        goal: store.goal(),
        pace: store.pace(),
        targetWeightKg: store.targetWeightKg(),
        diet,
        restrictions: store.restrictions(),
        mealsPerDay: store.mealsPerDay(),
        units: store.units(),
      };
    },
  })),
  withHooks({
    onInit(store) {
      // Si la app se cerró a mitad del onboarding, se retoma donde quedó.
      const draft = loadDraft();
      if (draft) patchState(store, { ...draft, showErrors: false });
      watchState(store, (state) => saveDraft(state));
    },
  }),
);
