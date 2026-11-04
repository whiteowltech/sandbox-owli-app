import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { Food } from '../../core/diary/diary.model';
import { DiaryStore } from '../../core/diary/diary.store';
import { dietPermits, restrictionConflicts } from '../../core/diary/diet-rules';
import type { Diet, Restriction } from '../../core/profile/profile.model';

/** Gramos rápidos: una porción típica se elige con un toque. */
const PRESETS = [50, 100, 150, 200, 300];
const SEARCH_DEBOUNCE_MS = 250;

/** Anotar a mano: siempre gratis, no usa análisis con IA. */
@Component({
  selector: 'owli-add-food-sheet',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <header>
        <div>
          <h2 id="add-title">{{ 'today.add.title' | transloco }}</h2>
          <p class="free">{{ 'today.add.free' | transloco }}</p>
        </div>
        <button type="button" class="close" (click)="closed.emit()">{{ 'common.cancel' | transloco }}</button>
      </header>

      @if (!selected()) {
        <label class="sr-only" for="food-search">{{ 'today.add.searchLabel' | transloco }}</label>
        <input
          id="food-search"
          class="search"
          type="search"
          autocomplete="off"
          enterkeyhint="search"
          [placeholder]="'today.add.placeholder' | transloco"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <ul class="results" [attr.aria-busy]="searching()">
          @for (f of results(); track f.id) {
            <li>
              <button type="button" class="result" (click)="pick(f)">
                <span class="name">{{ name(f) }}</span>
                <span class="per num">{{ 'today.add.per100' | transloco: { kcal: round(f.per100g.kcal) } }}</span>
              </button>
            </li>
          }
        </ul>
        @if (noResults()) {
          <p class="hint">{{ 'today.add.noResults' | transloco }}</p>
        } @else if (searchFailed()) {
          <p class="err" role="alert">{{ 'today.errors.offline' | transloco }}</p>
        }
      } @else {
        <div class="picked">
          <div class="picked-head">
            <p class="name">{{ name(selected()!) }}</p>
            <button type="button" class="link" (click)="selected.set(null)">
              {{ 'today.add.change' | transloco }}
            </button>
          </div>
          @if (warning(); as w) {
            <p class="warn" role="status">{{ w.key | transloco: w.params }}</p>
          }
          <div class="presets" role="group" [attr.aria-label]="'today.add.grams' | transloco">
            @for (g of presets; track g) {
              <button type="button" class="preset" [attr.aria-pressed]="grams() === g" (click)="grams.set(g)">
                {{ g }} g
              </button>
            }
          </div>
          <div class="grams">
            <button type="button" class="step" [attr.aria-label]="'today.add.less' | transloco" (click)="nudge(-10)">
              −
            </button>
            <span class="num value" aria-live="polite">{{ grams() }} g</span>
            <button type="button" class="step" [attr.aria-label]="'today.add.more' | transloco" (click)="nudge(10)">
              +
            </button>
          </div>
          <p class="portion num">
            {{ 'today.add.portion' | transloco: { kcal: round(portion().kcal), protein: round(portion().proteinG) } }}
          </p>
        </div>
        @if (diary.error() && !diary.saving()) {
          <p class="err" role="alert">{{ 'today.errors.' + diary.error() | transloco }}</p>
        }
        <button type="button" class="cta" [disabled]="diary.saving()" (click)="add()">
          {{ (diary.saving() ? 'today.add.saving' : 'today.add.confirm') | transloco }}
        </button>
      }
    </section>
  `,
  styleUrl: './add-food-sheet.component.scss',
})
export class AddFoodSheetComponent {
  protected readonly diary = inject(DiaryStore);
  readonly diet = input.required<Diet>();
  readonly restrictions = input<Restriction[]>([]);
  readonly lang = input('es');
  readonly closed = output<void>();
  readonly added = output<void>();

  protected readonly presets = PRESETS;
  protected readonly query = signal('');
  protected readonly results = signal<Food[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchFailed = signal(false);
  protected readonly selected = signal<Food | null>(null);
  protected readonly grams = signal(100);

  protected readonly noResults = computed(
    () => this.query().trim().length >= 2 && !this.searching() && !this.searchFailed() && this.results().length === 0,
  );

  protected readonly portion = computed(() => {
    const f = this.selected();
    const k = this.grams() / 100;
    return { kcal: (f?.per100g.kcal ?? 0) * k, proteinG: (f?.per100g.proteinG ?? 0) * k };
  });

  /** Aviso (no bloqueo) si el alimento no encaja con la dieta o una restricción. */
  protected readonly warning = computed(() => {
    const f = this.selected();
    if (!f) return null;
    const conflict = restrictionConflicts(this.restrictions(), f.traits)[0];
    if (conflict) return { key: `today.add.conflict.${conflict}`, params: {} };
    if (!dietPermits(this.diet(), f.traits)) return { key: `today.add.offDiet.${this.diet()}`, params: {} };
    return null;
  });

  private searchSeq = 0;

  constructor() {
    // Busca mientras se escribe, esperando una pausa para no pedir en cada letra.
    effect((onCleanup) => {
      const q = this.query();
      const seq = ++this.searchSeq;
      // La búsqueda queda pendiente desde la primera tecla: así no aparece
      // "No lo encontramos" durante la pausa antes de preguntar al servidor.
      const pending = q.trim().length >= 2;
      untracked(() => {
        this.searching.set(pending);
        this.searchFailed.set(false);
        if (!pending) this.results.set([]);
      });
      if (!pending) return;
      const timer = setTimeout(async () => {
        try {
          const found = await this.diary.search(q);
          if (seq === this.searchSeq) this.results.set(found);
        } catch {
          if (seq === this.searchSeq) this.searchFailed.set(true);
        } finally {
          if (seq === this.searchSeq) this.searching.set(false);
        }
      }, SEARCH_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected name(f: Food): string {
    return this.lang() === 'en' ? f.nameEn : f.nameEs;
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected pick(f: Food): void {
    this.selected.set(f);
    this.grams.set(100);
  }

  protected nudge(delta: number): void {
    this.grams.update((g) => Math.min(3000, Math.max(5, g + delta)));
  }

  protected async add(): Promise<void> {
    const f = this.selected();
    if (!f) return;
    if (await this.diary.add(f.id, this.grams())) this.added.emit();
  }
}
