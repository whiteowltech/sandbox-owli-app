import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { TranslocoPipe } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';

/** Encabezado de las pantallas secundarias: volver a Hoy + título. */
@Component({
  selector: 'owli-screen-header',
  imports: [IonIcon, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <a [routerLink]="backTo()" [attr.aria-label]="'common.back' | transloco">
        <ion-icon name="chevron-back-outline" aria-hidden="true" />
      </a>
      <h1>{{ title() }}</h1>
    </header>
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: env(safe-area-inset-top);
    }
    a {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: var(--owli-corteza);
      color: var(--owli-luna);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
    }
  `,
})
export class ScreenHeaderComponent {
  readonly title = input.required<string>();
  readonly backTo = input('/today');

  constructor() {
    addIcons({ chevronBackOutline });
  }
}
