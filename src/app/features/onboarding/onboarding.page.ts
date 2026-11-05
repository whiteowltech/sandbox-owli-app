import { ChangeDetectionStrategy, Component, computed, inject, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { LANGS, type Lang } from '../../core/i18n/transloco';
import { etaDate, RANGES } from '../../core/nutrition/plan';
import { ProfileSyncService } from '../../core/profile/profile-sync.service';
import type { ActivityLevel, Diet, Goal, Pace, Restriction, Sex } from '../../core/profile/profile.model';
import { DEMO_PROFILE, ProfileStore } from '../../core/profile/profile.store';
import { formatHeight, formatWeight } from '../../core/units/units';
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
