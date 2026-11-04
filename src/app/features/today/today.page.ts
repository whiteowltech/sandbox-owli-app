import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon, type ViewWillEnter } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  barChartOutline,
  cameraOutline,
  closeOutline,
  micOutline,
  personCircleOutline,
  searchOutline,
} from 'ionicons/icons';

import { AnalysisStore } from '../../core/analysis/analysis.store';
import type { Entry, OwliMood } from '../../core/diary/diary.model';
import { DiaryStore } from '../../core/diary/diary.store';
import { macroTargets } from '../../core/nutrition/macros';
import { planFor } from '../../core/nutrition/plan';
import { ProfileStore } from '../../core/profile/profile.store';
import { SuggestionsStore } from '../../core/suggestions/suggestions.store';
import { OwlComponent } from '../../shared/owl/owl.component';

import { AddFoodSheetComponent } from './add-food-sheet.component';
import { PhotoReviewSheetComponent } from './photo-review-sheet.component';
import { SuggestionsSheetComponent } from './suggestions-sheet.component';

/** Punto de la rama (misma curva que el SVG) para un avance t de 0 a 1. */
function branchAt(t: number): { x: number; y: number } {
  const u = 1 - t;
  return { x: u * u * -10 + 2 * u * t * 195 + t * t * 400, y: u * u * 116 + 2 * u * t * 84 + t * t * 110 };
}

@Component({
  selector: 'owli-today-page',
  imports: [
    IonContent,
    IonIcon,
    RouterLink,
    TranslocoPipe,
    OwlComponent,
    AddFoodSheetComponent,
    PhotoReviewSheetComponent,
    SuggestionsSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today.page.html',
  styleUrl: './today.page.scss',
})
export class TodayPage implements ViewWillEnter {
  protected readonly profile = inject(ProfileStore);
  protected readonly diary = inject(DiaryStore);
  protected readonly analysis = inject(AnalysisStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly sheetOpen = signal(false);
  protected readonly suggestionsOpen = signal(false);
  private readonly suggestions = inject(SuggestionsStore);

  /** Objetivo del servidor si ya cargó; si no, el mismo cálculo local (idéntico, ver plan.ts). */
  protected readonly target = computed(() => {
    const fromServer = this.diary.day()?.plan.dailyTarget;
    if (fromServer) return fromServer;
    const p = this.profile.profile();
    return p ? planFor(p).dailyTarget : 0;
  });
  protected readonly eaten = computed(() => Math.round(this.diary.eatenKcal()));
  protected readonly left = computed(() => this.target() - this.eaten());
  protected readonly totals = computed(
    () => this.diary.day()?.totals ?? { kcal: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
  );

  /** Objetivos del servidor; mientras tanto, el mismo cálculo local (ver macros.ts). */
  protected readonly targets = computed(() => {
    const fromServer = this.diary.day()?.targets;
    if (fromServer) return fromServer;
    const p = this.profile.profile();
    return p ? macroTargets(this.target(), p.weightKg, p.goal, p.diet) : null;
  });

  protected readonly macroRows = computed(() => {
    const t = this.targets();
    const eaten = this.totals();
    if (!t) return [];
    const row = (key: string, value: number, target: number) => ({
      key,
      eaten: value,
      target,
      ratio: target > 0 ? Math.min(1, value / target).toFixed(3) : '0',
    });
    return [
      row('protein', eaten.proteinG, t.proteinG),
      // En keto se cuentan los carbos netos (carbohidratos − fibra).
      t.netCarbs ? row('netCarbs', eaten.carbsG - eaten.fiberG, t.carbsG) : row('carbs', eaten.carbsG, t.carbsG),
      row('fat', eaten.fatG, t.fatG),
    ];
  });

  protected readonly mood = computed<OwliMood>(() => this.diary.day()?.mood ?? 'neutral');

  /** Lo que más importa ahora: la proteína que falta, o nada si el día está cerrado. */
  protected readonly hint = computed(() => {
    const t = this.targets();
    if (!t || this.mood() === 'satisfied') return null;
    if (this.left() < 0) return { key: 'today.hint.over', params: {} };
    const missing = Math.round(t.proteinG - this.totals().proteinG);
    if (missing <= 5) return null;
    // Con Owli cansado la frase ya habla de la proteína: solo se agrega cuánto falta.
    return { key: this.mood() === 'tired' ? 'today.hint.proteinShort' : 'today.hint.protein', params: { g: missing } };
  });

  /** Owli avanza por la rama a medida que se come. */
  protected readonly progress = computed(() => (this.target() ? Math.min(1, this.eaten() / this.target()) : 0));
  protected readonly owlPos = computed(() => {
    const p = branchAt(0.07 + this.progress() * 0.86);
    // Nunca más allá de los bordes: con el día vacío Owli queda entero al inicio de la rama.
    return `translate(${Math.round(Math.min(Math.max(p.x - 48, 8), 390 - 104))}px, ${Math.round(p.y - 92)}px)`;
  });
  protected readonly dash = computed(() => `${((0.07 + this.progress() * 0.86) * 100).toFixed(1)} 100`);

  protected readonly dateLabel = computed(() => {
    const iso = this.diary.day()?.date;
    const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
    const text = new Intl.DateTimeFormat(this.lang(), { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    // Solo la primera letra en mayúscula ("Martes, 3 de noviembre"), como en español.
    return text.charAt(0).toUpperCase() + text.slice(1);
  });

  constructor() {
    addIcons({ barChartOutline, personCircleOutline, searchOutline, closeOutline, cameraOutline, micOutline });
  }

  ionViewWillEnter(): void {
    void this.diary.load();
    void this.analysis.loadCredits();
  }

  /** Foto elegida o sacada: se analiza y se abre la confirmación. */
  protected onPhoto(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir la misma foto
    if (file) void this.analysis.analyze(file);
  }

  /** Qué comer ahora: se recalcula cada vez que se abre (lo que falta cambia al anotar). */
  protected openSuggestions(): void {
    this.suggestionsOpen.set(true);
    void this.suggestions.load();
  }

  protected onPhotoClosed(): void {
    void this.analysis.loadCredits();
  }

  protected num(n: number): string {
    return new Intl.NumberFormat(this.lang()).format(Math.round(n));
  }

  protected entryName(e: Entry): string {
    return this.lang() === 'en' ? e.nameEn : e.nameEs;
  }

  protected time(e: Entry): string {
    return new Intl.DateTimeFormat(this.lang(), { hour: '2-digit', minute: '2-digit' }).format(new Date(e.eatenAt));
  }

  protected onAdded(): void {
    this.sheetOpen.set(false);
  }
}
