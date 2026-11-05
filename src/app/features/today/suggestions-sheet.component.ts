import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { Food } from '../../core/diary/diary.model';
import { type Dish, SuggestionsStore } from '../../core/suggestions/suggestions.store';

/** Se muestran pocas opciones primero: elegir entre 10 cuesta más que entre 5. */
const FIRST_DISHES = 5;

/**
 * "Qué comer ahora": lo que falta para la próxima comida y platos concretos que
 * lo cubren (Meal Closing Engine). Anotar un plato es un toque y no usa créditos.
 */
@Component({
  selector: 'owli-suggestions-sheet',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suggestions-sheet.component.html',
  styleUrls: ['./add-food-sheet.component.scss', './suggestions-sheet.component.scss'],
})
export class SuggestionsSheetComponent {
  protected readonly store = inject(SuggestionsStore);
  readonly lang = input('es');
  readonly closed = output<void>();
  readonly manual = output<void>();

  protected readonly showAll = signal(false);
  protected readonly dishes = computed(() => {
    const all = this.store.closing()?.dishes ?? [];
    return this.showAll() ? all : all.slice(0, FIRST_DISHES);
  });
  protected readonly hidden = computed(() => (this.store.closing()?.dishes.length ?? 0) - this.dishes().length);

  /** Por qué la lista es como es: macros del día ya pasados y acompañamientos. */
  protected readonly notes = computed(() => {
    const c = this.store.closing();
    if (!c) return [];
    const out: { key: string; g?: number }[] = [];
    // `over` puede faltar si la app se publica antes que la API que lo envía.
    const fat = c.over?.fatG ?? 0;
    const carbs = c.over?.carbsG ?? 0;
    if (fat >= 1) out.push({ key: 'today.closing.overFat', g: Math.round(fat) });
    if (carbs >= 1) out.push({ key: 'today.closing.overCarbs', g: Math.round(carbs) });
    if (c.dishes[0]?.side) out.push({ key: 'today.closing.sidesHint' });
    return out;
  });

  protected dishName(d: Dish): string {
    return this.lang() === 'en' ? d.nameEn : d.nameEs;
  }

  /** "120 g de pechuga de pollo asada + 215 g de arroz blanco cocido" */
  protected portionName(f: Food): string {
    const name = this.lang() === 'en' ? f.nameEn : f.nameEs;
    return name.charAt(0).toLocaleLowerCase(this.lang()) + name.slice(1);
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected async log(d: Dish): Promise<void> {
    if (await this.store.logDish(d)) this.closed.emit();
  }
}
