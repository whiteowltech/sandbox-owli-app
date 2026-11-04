import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { AnalysisStore, type DraftItem } from '../../core/analysis/analysis.store';
import { DeviceSpeech } from '../../core/analysis/speech';
import type { Food } from '../../core/diary/diary.model';
import { DiaryStore } from '../../core/diary/diary.store';

/** Textos que cambian entre foto y voz; el resto se comparte. */
const VOICE_KEYS = new Set([
  'analyzing',
  'analyzingHint',
  'errorTitle',
  'noFoodTitle',
  'noFoodBody',
  'reviewHint',
  'discarded',
]);

/**
 * Pantalla de confirmación del análisis por foto o por voz. Se muestra SIEMPRE:
 * el usuario revisa y corrige alimentos y gramos antes de guardar (CLAUDE.md).
 * En voz, además muestra la grabación en curso y lo que se entendió.
 */
@Component({
  selector: 'owli-photo-review-sheet',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './photo-review-sheet.component.html',
  styleUrls: ['./add-food-sheet.component.scss', './photo-review-sheet.component.scss'],
})
export class PhotoReviewSheetComponent {
  protected readonly analysis = inject(AnalysisStore);
  protected readonly speech = inject(DeviceSpeech);
  private readonly diary = inject(DiaryStore);
  readonly lang = input('es');
  /** Calorías que quedan antes de guardar, para mostrar el impacto. */
  readonly leftKcal = input(0);
  readonly closed = output<void>();
  readonly manual = output<void>();

  protected readonly picking = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly results = signal<Food[]>([]);

  protected readonly leftAfter = computed(() => Math.round(this.leftKcal() - this.analysis.draftKcal()));
  protected readonly unresolved = computed(() => this.analysis.kept().filter((d) => !d.food).length);

  /** Clave de i18n según el origen: today.voice.* o today.photo.* */
  protected k(key: string): string {
    return this.analysis.kind() === 'voice' && VOICE_KEYS.has(key) ? `today.voice.${key}` : `today.photo.${key}`;
  }

  protected name(d: DraftItem): string {
    if (!d.food) return d.displayName;
    return this.lang() === 'en' ? d.food.nameEn : d.food.nameEs;
  }

  protected foodName(f: Food): string {
    return this.lang() === 'en' ? f.nameEn : f.nameEs;
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected kcal(d: DraftItem): number {
    return Math.round(((d.food?.per100g.kcal ?? 0) * d.grams) / 100);
  }

  protected startPick(d: DraftItem): void {
    this.picking.set(d.key);
    this.query.set(d.displayName);
    void this.search(d.displayName);
  }

  protected async search(q: string): Promise<void> {
    this.query.set(q);
    try {
      this.results.set(await this.diary.search(q));
    } catch {
      this.results.set([]);
    }
  }

  protected pick(f: Food): void {
    const key = this.picking();
    if (key !== null) this.analysis.setFood(key, f);
    this.picking.set(null);
  }

  protected async save(): Promise<void> {
    if (await this.analysis.save()) this.closed.emit();
  }

  protected close(): void {
    this.analysis.close();
    this.closed.emit();
  }
}
