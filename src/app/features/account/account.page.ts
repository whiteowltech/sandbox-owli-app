import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonContent, type ViewWillEnter } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AnalysisStore } from '../../core/analysis/analysis.store';
import { AuthService } from '../../core/auth/auth.service';
import { DiaryStore } from '../../core/diary/diary.store';
import { LANGS, type Lang } from '../../core/i18n/transloco';
import { etaDate } from '../../core/nutrition/plan';
import { ProfileSyncService } from '../../core/profile/profile-sync.service';
import type { ActivityLevel, Diet, Goal, Pace, Restriction, Sex, UnitSystem } from '../../core/profile/profile.model';
import { ProfileStore } from '../../core/profile/profile.store';
import { formatHeight, formatWeight } from '../../core/units/units';
import { ScreenHeaderComponent } from '../../shared/screen-header/screen-header.component';
import { StepperComponent } from '../../shared/stepper/stepper.component';

import { AccountStore, MEALS_MAX, MEALS_MIN, type Section } from './account.store';

type SaveResult = 'saved' | 'pending' | null;

/**
 * "Tu cuenta": el plan (editable, con el objetivo recalculado en vivo), los créditos,
 * las preferencias y el borrado de la cuenta. Los cambios del plan se guardan juntos
 * con "Guardar cambios"; idioma y unidades se aplican al instante.
 */
@Component({
  selector: 'owli-account-page',
  imports: [IonContent, TranslocoPipe, ScreenHeaderComponent, StepperComponent],
  providers: [AccountStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage implements ViewWillEnter {
  protected readonly s = inject(AccountStore);
  private readonly profile = inject(ProfileStore);
  private readonly auth = inject(AuthService);
  private readonly diary = inject(DiaryStore);
  protected readonly analysis = inject(AnalysisStore);
  private readonly sync = inject(ProfileSyncService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly langs = LANGS;
  protected readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly sexes: Sex[] = ['female', 'male'];
  protected readonly activities: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
  protected readonly goals: Goal[] = ['cut', 'maintain', 'bulk', 'recomp'];
  protected readonly paces: Pace[] = ['slow', 'steady', 'fast'];
  protected readonly diets: Diet[] = ['omnivore', 'vegetarian', 'pescetarian', 'vegan', 'keto', 'paleo', 'carnivore'];
  protected readonly restrictionOptions: Restriction[] = ['gluten_free', 'lactose_free'];
  protected readonly mealOptions = Array.from({ length: MEALS_MAX - MEALS_MIN + 1 }, (_, i) => MEALS_MIN + i);

  protected readonly saving = signal(false);
  protected readonly saveResult = signal<SaveResult>(null);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteFailed = signal(false);

  ionViewWillEnter(): void {
    this.s.load(this.profile.profile());
    this.saveResult.set(null);
    this.confirmingDelete.set(false);
    this.deleteFailed.set(false);
    void this.analysis.loadCredits();
  }

  protected num(n: number): string {
    return new Intl.NumberFormat(this.lang()).format(Math.round(n));
  }

  private weight(kg: number): string {
    return formatWeight(kg, this.s.draft()?.units ?? 'metric', this.lang());
  }

  protected readonly heightText = computed(() => {
    const d = this.s.draft();
    return d ? formatHeight(d.heightCm, d.units) : '';
  });
  protected readonly weightText = computed(() => this.weight(this.s.draft()?.weightKg ?? 0));
  protected readonly targetText = computed(() => this.weight(this.s.draft()?.targetWeightKg ?? 0));

  protected readonly rateParams = computed(() => ({
    sign: this.s.draft()?.goal === 'bulk' ? '+' : '−',
    weight: this.weight(this.s.plan()?.weeklyRateKg ?? 0),
  }));

  protected readonly etaText = computed(() => {
    const weeks = this.s.plan()?.weeksToGoal;
    if (weeks == null) return '';
    const fmt = new Intl.DateTimeFormat(this.lang(), { day: 'numeric', month: 'long', year: 'numeric' });
    return fmt.format(etaDate(weeks, new Date()));
  });

  /** Emite cuando el idioma activo terminó de cargar: los resúmenes se arman con translate(). */
  private readonly translation = toSignal(this.transloco.selectTranslation(), { initialValue: null });

  /** Resumen de cada sección cerrada, en una línea. */
  protected readonly summaries = computed(() => {
    const d = this.s.draft();
    if (!d || !this.translation()) return null;
    const t = (key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params);
    const goal = [t(`onboarding.goals.${d.goal}.label`)];
    if (d.goal === 'cut' || d.goal === 'bulk') {
      goal.push(this.weight(d.targetWeightKg), t(`onboarding.paces.${d.pace}`));
    }
    return {
      body: [
        t(`onboarding.sexes.${d.sex}`),
        t('onboarding.years', { n: d.ageYears }),
        formatHeight(d.heightCm, d.units),
        this.weight(d.weightKg),
        t(`onboarding.activities.${d.activity}.short`),
      ].join(', '),
      goal: goal.join(', '),
      diet: [
        t(`onboarding.diets.${d.diet}.label`),
        ...d.restrictions.map((r) => t(`onboarding.restrictions.${r}`)),
      ].join(', '),
      meals: t(d.mealsPerDay === 1 ? 'account.mealsOne' : 'account.mealsOther', { n: d.mealsPerDay }),
      name: d.name.trim() || t('account.noName'),
    };
  });

  protected toggle(section: Section): void {
    this.s.toggle(section);
    this.saveResult.set(null);
  }

  protected setLang(lang: Lang): void {
    this.transloco.setActiveLang(lang);
  }

  /** Preferencia de pantalla: se guarda al instante, sin tocar el borrador del plan. */
  protected setUnits(units: UnitSystem): void {
    this.profile.update({ units });
    this.s.unitsSaved(units);
    void this.sync.sync();
  }

  protected async save(): Promise<void> {
    const next = this.s.toSave();
    if (!next || this.saving()) return;
    this.saving.set(true);
    // Primero en el teléfono: la app ya usa el plan nuevo aunque no haya conexión.
    this.profile.save(next);
    this.s.commit(next);
    const uploaded = await this.sync.sync();
    this.saving.set(false);
    this.saveResult.set(uploaded ? 'saved' : 'pending');
    void this.diary.load(); // el objetivo y el ánimo de Owli vienen del servidor
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleting()) return;
    this.deleting.set(true);
    this.deleteFailed.set(false);
    try {
      await this.auth.deleteAccount();
    } catch {
      // Sin conexión no se borra nada: el usuario tiene que saber que la cuenta sigue existiendo.
      this.deleting.set(false);
      this.deleteFailed.set(true);
      return;
    }
    this.sync.reset();
    this.diary.clear();
    this.profile.clear();
    this.deleting.set(false);
    void this.router.navigateByUrl('/onboarding', { replaceUrl: true });
  }
}
