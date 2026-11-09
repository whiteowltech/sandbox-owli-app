import { ChangeDetectionStrategy, Component, computed, inject, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { LANGS, type Lang } from '../../core/i18n/transloco';
import { macroTargets } from '../../core/nutrition/macros';
import { etaDate, RANGES } from '../../core/nutrition/plan';
import { ProfileSyncService } from '../../core/profile/profile-sync.service';
import type { ActivityLevel, Diet, Goal, Pace, Restriction, Sex } from '../../core/profile/profile.model';
import { DEMO_PROFILE, ProfileStore } from '../../core/profile/profile.store';
import { formatHeight, formatWeight } from '../../core/units/units';
import { tweened } from '../../shared/motion/motion';
import { OwlComponent } from '../../shared/owl/owl.component';
import { StepperComponent } from '../../shared/stepper/stepper.component';

import { AGE_INPUT_MIN, clearOnboardingDraft, OnboardingStore, STEPS } from './onboarding.store';

/** Posición x de cada nudo de la rama (paso 1, 2 y 3). */
const KNOTS = [70, 195, 320];

/** Altura de la rama en x (curva cuadrática del SVG), para apoyar los nudos sobre ella. */
function branchY(x: number): number {
  const t = (x + 10) / 410;
  const u = 1 - t;
  return u * u * 56 + 2 * u * t * 46 + t * t * 54;
}

@Component({
  selector: 'owli-onboarding-page',
  imports: [IonContent, TranslocoPipe, OwlComponent, StepperComponent],
  providers: [OnboardingStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage {
  protected readonly s = inject(OnboardingStore);
  private readonly profile = inject(ProfileStore);
  private readonly sync = inject(ProfileSyncService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly devMode = isDevMode();
  protected readonly langs = LANGS;
  protected readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly sexes: Sex[] = ['female', 'male'];
  protected readonly activities: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
  protected readonly goals: Goal[] = ['cut', 'maintain', 'bulk', 'recomp'];
  protected readonly paces: Pace[] = ['slow', 'steady', 'fast'];
  protected readonly diets: Diet[] = ['omnivore', 'vegetarian', 'pescetarian', 'vegan', 'keto', 'paleo', 'carnivore'];
  protected readonly restrictionOptions: Restriction[] = ['gluten_free', 'lactose_free'];
  protected readonly mealOptions = [1, 2, 3, 4, 5];
  protected readonly ranges = { ...RANGES, ageMin: AGE_INPUT_MIN, ageMax: 99, heightMin: 130, heightMax: 220 };

  protected readonly knots = computed(() => {
    const step = this.s.stepNumber();
    return KNOTS.map((x, i) => ({
      x,
      y: branchY(x).toFixed(1),
      state: i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'next',
    }));
  });
  protected readonly owlX = computed(() => `${KNOTS[Math.min(Math.max(this.s.stepNumber() - 1, 0), 2)] - 26}px`);

  protected readonly heightText = computed(() => formatHeight(this.s.heightCm(), this.s.units()));
  protected readonly weightText = computed(() => formatWeight(this.s.weightKg(), this.s.units(), this.lang()));
  protected readonly targetText = computed(() => formatWeight(this.s.targetWeightKg(), this.s.units(), this.lang()));

  protected readonly rateParams = computed(() => {
    const plan = this.s.plan();
    return {
      sign: this.s.goal() === 'bulk' ? '+' : '−',
      weight: formatWeight(plan?.weeklyRateKg ?? 0, this.s.units(), this.lang()),
    };
  });

  protected readonly etaText = computed(() => {
    const weeks = this.s.plan()?.weeksToGoal;
    if (weeks == null) return '';
    const fmt = new Intl.DateTimeFormat(this.lang(), { day: 'numeric', month: 'long', year: 'numeric' });
    return fmt.format(etaDate(weeks, new Date()));
  });

  protected readonly explainParams = computed(() => {
    const plan = this.s.plan();
    if (!plan) return { tdee: '', delta: '' };
    return { tdee: this.num(plan.tdee), delta: this.num(Math.abs(plan.dailyTarget - plan.tdee)) };
  });

  /** Presentación del plan: las calorías cuentan desde 0 al llegar a "Listo". */
  protected readonly targetShown = tweened(
    () => (this.s.step() === 'ready' ? (this.s.plan()?.dailyTarget ?? 0) : 0),
    900,
  );

  /** Reparto del objetivo: gramos de cada macro y su parte de las calorías (ancho de la barra). */
  protected readonly split = computed(() => {
    const plan = this.s.plan();
    const diet = this.s.diet();
    if (!plan || !diet) return null;
    const t = macroTargets(plan.dailyTarget, this.s.weightKg(), this.s.goal(), diet);
    const kcal = { protein: t.proteinG * 4, carbs: t.carbsG * 4, fat: t.fatG * 9 };
    const total = kcal.protein + kcal.carbs + kcal.fat || 1;
    const part = (key: string, g: number, k: number) => ({
      key,
      g: Math.round(g),
      pct: ((k / total) * 100).toFixed(1),
    });
    return [
      part('protein', t.proteinG, kcal.protein),
      part(t.netCarbs ? 'netCarbs' : 'carbs', t.carbsG, kcal.carbs),
      part('fat', t.fatG, kcal.fat),
    ].filter((p) => p.g > 0);
  });

  /**
   * Curva del peso de hoy al peso meta, solo para perder o ganar con una fecha posible.
   * Es una forma ilustrativa (más rápido al principio), no un pronóstico semana a semana.
   */
  protected readonly projection = computed(() => {
    const plan = this.s.plan();
    const goal = this.s.goal();
    if (!plan || plan.weeksToGoal == null || (goal !== 'cut' && goal !== 'bulk')) return null;
    const [y0, y1] = goal === 'cut' ? [18, 82] : [82, 18];
    const date = new Intl.DateTimeFormat(this.lang(), { month: 'short', year: 'numeric' }).format(
      etaDate(plan.weeksToGoal, new Date()),
    );
    return {
      path: `M10 ${y0} C110 ${y0 + (y1 - y0) * 0.75}, 190 ${y1}, 290 ${y1}`,
      endY: y1,
      from: this.weightText(),
      to: this.targetText(),
      date,
    };
  });

  protected round(n: number): number {
    return Math.round(n);
  }

  protected num(n: number): string {
    return new Intl.NumberFormat(this.lang()).format(n);
  }

  protected setLang(lang: Lang): void {
    this.transloco.setActiveLang(lang);
  }

  protected next(): void {
    if (this.s.step() === 'ready') {
      this.finish();
      return;
    }
    if (!this.s.next()) {
      // El primer error queda a la vista y se anuncia (role="alert").
      setTimeout(() => document.querySelector('.err')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
  }

  protected finish(): void {
    const profile = this.s.toProfile();
    if (!profile) return;
    this.profile.save(profile);
    clearOnboardingDraft();
    // El perfil ya está en el teléfono: la subida no bloquea entrar a Hoy.
    void this.sync.sync();
    void this.router.navigateByUrl('/today', { replaceUrl: true });
  }

  protected useDemoProfile(): void {
    this.profile.save(DEMO_PROFILE);
    clearOnboardingDraft();
    void this.router.navigateByUrl('/today', { replaceUrl: true });
  }

  protected readonly steps = STEPS;
}
