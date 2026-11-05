import { TestBed } from '@angular/core/testing';

import { planFor } from '../../core/nutrition/plan';
import { DEMO_PROFILE } from '../../core/profile/profile.store';

import { AccountStore } from './account.store';

function setup() {
  TestBed.configureTestingModule({ providers: [AccountStore] });
  const s = TestBed.inject(AccountStore);
  s.load(DEMO_PROFILE);
  return s;
}

describe('AccountStore', () => {
  it('arranca sin cambios y recalcula el objetivo en vivo al editar', () => {
    const s = setup();
    expect(s.dirty()).toBe(false);
    expect(s.toSave()).toBeNull();
    expect(s.plan()?.dailyTarget).toBe(planFor(DEMO_PROFILE).dailyTarget);

    s.setActivity('very_active');
    expect(s.dirty()).toBe(true);
    expect(s.plan()!.dailyTarget).toBeGreaterThan(s.savedPlan()!.dailyTarget);
    expect(s.toSave()?.activity).toBe('very_active');
  });

  it('comidas por día de 1 a 5, y volver al valor original no cuenta como cambio', () => {
    const s = setup();
    s.setMeals(9);
    expect(s.draft()?.mealsPerDay).toBe(5);
    s.setMeals(0);
    expect(s.draft()?.mealsPerDay).toBe(1);
    s.setMeals(DEMO_PROFILE.mealsPerDay);
    expect(s.dirty()).toBe(false);
  });

  it('no deja guardar a un menor de edad ni un peso meta en la dirección contraria', () => {
    const s = setup();
    s.setAge(16);
    expect(s.errors()).toEqual(['underage']);
    expect(s.toSave()).toBeNull();
    s.setAge(30);

    // Perder grasa con un peso meta por encima del actual.
    s.setTargetWeight(DEMO_PROFILE.weightKg + 5);
    expect(s.errors()).toEqual(['wrongDirectionCut']);
    expect(s.toSave()).toBeNull();
  });

  it('al cambiar de objetivo respeta el peso meta salvo que quede al revés', () => {
    const s = setup();
    s.setGoal('maintain');
    expect(s.draft()?.targetWeightKg).toBe(DEMO_PROFILE.targetWeightKg);
    s.setGoal('bulk'); // 74 kg con 80 kg actuales: se sugiere uno por encima
    expect(s.draft()!.targetWeightKg).toBeGreaterThan(DEMO_PROFILE.weightKg);
    expect(s.errors()).toEqual([]);
  });

  it('descartar vuelve a lo guardado; commit fija el nuevo perfil', () => {
    const s = setup();
    s.setDiet('keto');
    s.discard();
    expect(s.draft()?.diet).toBe('omnivore');

    s.setName('  Ana  ');
    const next = s.toSave()!;
    expect(next.name).toBe('Ana');
    s.commit(next);
    expect(s.dirty()).toBe(false);
    expect(s.saved()?.name).toBe('Ana');
  });

  it('las unidades se aplican sin dejar cambios pendientes', () => {
    const s = setup();
    s.unitsSaved('imperial');
    expect(s.draft()?.units).toBe('imperial');
    expect(s.dirty()).toBe(false);
  });
});
