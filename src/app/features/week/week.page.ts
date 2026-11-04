import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { TranslocoPipe } from '@jsverse/transloco';

import { ScreenHeaderComponent } from '../../shared/screen-header/screen-header.component';

// Progreso semanal: calorías por día contra el objetivo. Llega en los próximos pasos.
@Component({
  selector: 'owli-week-page',
  imports: [IonContent, TranslocoPipe, ScreenHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content class="ion-padding">
      <owli-screen-header [title]="'week.title' | transloco" />
      <p class="soon">{{ 'common.soon' | transloco }}</p>
    </ion-content>
  `,
  styles: `
    .soon {
      color: var(--owli-texto-terciario);
    }
  `,
})
export class WeekPage {}
