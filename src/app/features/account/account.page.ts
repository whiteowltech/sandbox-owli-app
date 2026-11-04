import { ChangeDetectionStrategy, Component, inject, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { DiaryStore } from '../../core/diary/diary.store';
import { LANGS, type Lang } from '../../core/i18n/transloco';
import { ProfileSyncService } from '../../core/profile/profile-sync.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { ScreenHeaderComponent } from '../../shared/screen-header/screen-header.component';

// Cuenta: tu plan, créditos y Owli Pro, privacidad. Llega en los próximos pasos.
@Component({
  selector: 'owli-account-page',
  imports: [IonContent, IonButton, TranslocoPipe, ScreenHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content class="ion-padding">
      <owli-screen-header [title]="'account.title' | transloco" />
      <div class="langs" role="group" [attr.aria-label]="'account.language' | transloco">
        @for (lang of langs; track lang) {
          <button type="button" [attr.aria-pressed]="lang === activeLang()" (click)="setLang(lang)">
            {{ lang.toUpperCase() }}
          </button>
        }
      </div>
      <p class="soon">{{ 'common.soon' | transloco }}</p>
      <p class="disclaimer">{{ 'account.disclaimer' | transloco }}</p>
      @if (devMode) {
        <ion-button fill="outline" expand="block" (click)="reset()">{{ 'dev.resetProfile' | transloco }}</ion-button>
      }
    </ion-content>
  `,
  styles: `
    .langs {
      display: flex;
      gap: 4px;
      margin-top: 24px;
      padding: 4px;
      width: fit-content;
      border-radius: 12px;
      background: var(--owli-corteza);
    }
    .langs button {
      min-width: 48px;
      height: 40px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--owli-texto-terciario);
      font: inherit;
      font-weight: 600;
    }
    .langs button[aria-pressed='true'] {
      background: var(--owli-corteza-alta);
      color: var(--owli-luna);
    }
    .soon {
      color: var(--owli-texto-terciario);
    }
    .disclaimer {
      font-size: 13px;
      line-height: 1.5;
      color: var(--owli-texto-terciario);
    }
  `,
})
export class AccountPage {
  private readonly profile = inject(ProfileStore);
  private readonly auth = inject(AuthService);
  private readonly diary = inject(DiaryStore);
  private readonly sync = inject(ProfileSyncService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly devMode = isDevMode();
  protected readonly langs = LANGS;
  protected readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected setLang(lang: Lang): void {
    this.transloco.setActiveLang(lang);
  }

  protected async reset(): Promise<void> {
    try {
      await this.auth.deleteAccount();
    } catch {
      this.auth.clear(); // sin conexión: se borra lo local; la cuenta anónima queda huérfana en el servidor
    }
    this.sync.reset();
    this.diary.clear();
    this.profile.clear();
    void this.router.navigateByUrl('/onboarding', { replaceUrl: true });
  }
}
