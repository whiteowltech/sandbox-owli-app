import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonContent, IonIcon, type ViewWillEnter } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';

import type { OwliMood } from '../../core/diary/diary.model';
import { type WeekDay, WeekStore } from '../../core/week/week.store';
import { OwlComponent } from '../../shared/owl/owl.component';
import { ScreenHeaderComponent } from '../../shared/screen-header/screen-header.component';

type DayState = 'closed' | 'open' | 'empty' | 'today';

interface DayView {
  date: string;
  short: string;
  long: string;
  state: DayState;
  mood: OwliMood;
  kcal: number;
  proteinG: number;
  /** Alto de las barras en % del área del gráfico. */
  kcalH: number;
  proteinH: number;
}

/** El área del gráfico llega hasta un 20 % por encima del objetivo (o del día más alto). */
const HEADROOM = 1.2;

/**
 * "Tu semana": cómo fueron los últimos 7 días contra el objetivo. Las barras se
 * pueden tocar para ver el detalle del día, y hay una tabla con los mismos datos.
 */
@Component({
  selector: 'owli-week-page',
  imports: [IonContent, IonIcon, TranslocoPipe, OwlComponent, ScreenHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week.page.html',
  styleUrl: './week.page.scss',
})
export class WeekPage implements ViewWillEnter {
  protected readonly store = inject(WeekStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly selected = signal<string | null>(null);
  protected readonly showTable = signal(false);

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline });
  }

  ionViewWillEnter(): void {
    this.selected.set(null);
    void this.store.load();
  }

  private date(iso: string, opts: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.lang(), { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  }

  private capitalize(s: string): string {
    return s.charAt(0).toLocaleUpperCase(this.lang()) + s.slice(1);
  }

  protected num(n: number): string {
    return new Intl.NumberFormat(this.lang()).format(Math.round(n));
  }

  protected readonly range = computed(() => {
    const w = this.store.week();
    if (!w) return '';
    return this.transloco.translate('week.range', {
      start: this.date(w.start, { day: 'numeric', month: 'long' }),
      end: this.date(w.end, { day: 'numeric', month: 'long' }),
    });
  });

  protected readonly days = computed<DayView[]>(() => {
    const w = this.store.week();
    if (!w) return [];
    const maxK = Math.max(w.target.kcal * HEADROOM, ...w.days.map((d) => d.totals.kcal));
    const maxP = Math.max(w.target.proteinG * HEADROOM, ...w.days.map((d) => d.totals.proteinG));
    return w.days.map((d) => ({
      date: d.date,
      short: this.date(d.date, { weekday: 'narrow' }),
      long: this.capitalize(this.date(d.date, { weekday: 'long', day: 'numeric' })),
      state: this.stateOf(d),
      mood: d.entries > 0 ? d.mood : 'neutral',
      kcal: d.totals.kcal,
      proteinG: d.totals.proteinG,
      kcalH: (d.totals.kcal / maxK) * 100,
      proteinH: (d.totals.proteinG / maxP) * 100,
    }));
  });

  /** Dónde cae la línea del objetivo, en % desde abajo. */
  protected readonly targetLines = computed(() => {
    const w = this.store.week();
    if (!w) return { kcal: 0, protein: 0 };
    const maxK = Math.max(w.target.kcal * HEADROOM, ...w.days.map((d) => d.totals.kcal));
    const maxP = Math.max(w.target.proteinG * HEADROOM, ...w.days.map((d) => d.totals.proteinG));
    return { kcal: (w.target.kcal / maxK) * 100, protein: (w.target.proteinG / maxP) * 100 };
  });

  /** Owli de la semana: contento si cerró la mayoría, cansado si faltó proteína casi siempre. */
  protected readonly weekMood = computed<OwliMood>(() => {
    const r = this.store.week()?.review;
    if (!r || r.loggedDays === 0) return 'neutral';
    if (r.closedDays * 2 >= r.loggedDays) return 'satisfied';
    if (r.proteinShortDays * 2 > r.loggedDays) return 'tired';
    return 'energetic';
  });

  /** Lo que Owli dice de la semana: lo más importante primero. */
  protected readonly comment = computed(() => {
    const r = this.store.week()?.review;
    if (!r || r.loggedDays === 0) return null;
    const plural = (n: number) => (n === 1 ? 'One' : 'Other');
    if (r.proteinShortDays > 0)
      return { key: `week.comment.protein${plural(r.proteinShortDays)}`, n: r.proteinShortDays };
    if (r.overDays > 0) return { key: `week.comment.over${plural(r.overDays)}`, n: r.overDays };
    if (r.closedDays === r.loggedDays) return { key: 'week.comment.allClosed', n: 0 };
    return { key: 'week.comment.keepGoing', n: 0 };
  });

  protected readonly detail = computed(() => {
    const w = this.store.week();
    const date = this.selected();
    const d = w?.days.find((x) => x.date === date);
    if (!w || !d) return null;
    const v = this.days().find((x) => x.date === date)!;
    const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + this.num(Math.abs(n));
    return {
      title: v.long,
      state: v.state,
      kcal: this.num(d.totals.kcal),
      dk: signed(d.totals.kcal - w.target.kcal),
      p: this.num(d.totals.proteinG),
      dp: signed(d.totals.proteinG - w.target.proteinG),
    };
  });

  private stateOf(d: WeekDay): DayState {
    if (d.closed) return 'closed';
    if (d.inProgress) return 'today';
    return d.entries > 0 ? 'open' : 'empty';
  }

  protected pick(date: string): void {
    this.selected.update((s) => (s === date ? null : date));
  }

  protected async go(dir: -1 | 1): Promise<void> {
    this.selected.set(null);
    await (dir < 0 ? this.store.previous() : this.store.next());
  }
}
