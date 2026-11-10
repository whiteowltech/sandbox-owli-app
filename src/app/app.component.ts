import { afterNextRender, Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { dismissSplash } from './core/splash/splash';

@Component({
  selector: 'owli-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    // La presentación de index.html se va cuando la app ya dibujó su primera pantalla.
    afterNextRender(() => dismissSplash());
  }
}
