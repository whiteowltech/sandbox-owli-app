import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Valor numérico ajustable con − / + y un deslizador: rápido con el pulgar y preciso
 * con los botones. El texto mostrado (unidades, formato) lo decide quien lo usa.
 */
@Component({
  selector: 'owli-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <span class="label" [id]="labelId()">{{ label() }}</span>
      <button type="button" class="step" [attr.aria-label]="decLabel()" (click)="emit(value() - step())">−</button>
      <span class="value num" aria-live="polite">{{ display() }}</span>
      <button type="button" class="step" [attr.aria-label]="incLabel()" (click)="emit(value() + step())">+</button>
    </div>
    <input
      type="range"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [value]="value()"
      [attr.aria-labelledby]="labelId()"
      [attr.aria-valuetext]="display()"
      (input)="emit(+$any($event.target).value)"
    />
  `,
  styles: `
    :host {
      display: block;
      border-radius: 16px;
      background: var(--owli-corteza);
      padding: 8px 12px 0;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .label {
      flex-grow: 1;
      font-size: 14px;
      color: var(--owli-pluma);
    }
    .step {
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 12px;
      background: var(--owli-pino);
      color: var(--owli-luna);
      font: inherit;
      font-size: 22px;
      font-weight: 700;
    }
    .value {
      min-width: 108px;
      text-align: center;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    input[type='range'] {
      width: 100%;
      height: 36px;
      margin: 0;
      accent-color: var(--owli-ojo);
    }
  `,
})
export class StepperComponent {
  readonly label = input.required<string>();
  readonly labelId = input.required<string>();
  /** Texto visible del valor, ya formateado (p. ej. "75 kg" o "5′ 9″"). */
  readonly display = input.required<string>();
  readonly value = input.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly step = input(1);
  readonly decLabel = input.required<string>();
  readonly incLabel = input.required<string>();
  /** Valor pedido por el usuario. Quien lo recibe decide si lo acota. */
  readonly changed = output<number>();

  protected emit(v: number): void {
    this.changed.emit(Math.min(this.max(), Math.max(this.min(), v)));
  }
}
