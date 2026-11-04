import { TestBed } from '@angular/core/testing';

import { nextTargetWeight, OnboardingStore } from './onboarding.store';

const DRAFT_KEY = 'owli:onboarding-draft:v1';

function create() {
  TestBed.configureTestingModule({ providers: [OnboardingStore] });
  return TestBed.inject(OnboardingStore);
}

describe('OnboardingStore', () => {
  beforeEach(() => localStorage.clear());

  it('empieza en el saludo, sin sexo presupuesto y sin gasto calculado', () => {
    const s = create();
    expect(s.step()).toBe('hello');
    expect(s.sex()).toBeNull();
    expect(s.plan()).toBeNull();
  });

  it('el nombre es opcional y se recorta a 40 caracteres', () => {
    const s = create();
    expect(s.next()).toBe(true);
    expect(s.step()).toBe('body');
    s.setName('x'.repeat(60));
    expect(s.name().length).toBe(40);
  });

  it('no deja avanzar sin sexo ni con menos de 18 años, y muestra los errores', () => {
    const s = create();
    s.next();
    s.setAge(16);
    expect(s.next()).toBe(false);
    expect(s.visibleErrors()).toEqual(['sexRequired', 'underage']);

    s.setSex('female');
    expect(s.next()).toBe(false);
    expect(s.visibleErrors()).toEqual(['underage']);

    s.setAge(18);
    expect(s.next()).toBe(true);
    expect(s.step()).toBe('goal');
    expect(s.visibleErrors()).toEqual([]);
  });

  it('calcula el gasto en vivo en cuanto hay sexo', () => {
    const s = create();
    s.next();
    s.setSex('male');
    s.setAge(30);
    s.setHeight(180);
    s.setWeight(80);
    s.setActivity('moderate');
    expect(s.plan()?.tdee).toBe(2759); // mismo valor que biometrics_test.go
  });

  it('acota los valores a rangos plausibles', () => {
    const s = create();
    s.setAge(5);
    s.setHeight(400);
    s.setWeight(80.3);
    expect(s.ageYears()).toBe(13);
    expect(s.heightCm()).toBe(250);
    expect(s.weightKg()).toBe(80.5);
  });

  it('al dejar "tu cuerpo", el peso meta se acomoda al peso real', () => {
    const s = create();
    s.next();
    s.setSex('male');
    s.setWeight(100);
    s.next();
    expect(s.goal()).toBe('cut');
    expect(s.targetWeightKg()).toBe(93);
  });

  it('sugiere un peso meta mientras el usuario no lo toque, y después lo respeta', () => {
    expect(nextTargetWeight('bulk', 70, 65, false)).toBe(73.5);
    expect(nextTargetWeight('cut', 70, 50, false)).toBe(65);
    expect(nextTargetWeight('maintain', 70, 64, false)).toBe(70);
    expect(nextTargetWeight('cut', 70, 64, true)).toBe(64);
    // tocado pero en la dirección contraria: se corrige
    expect(nextTargetWeight('cut', 70, 75, true)).toBe(65);
    expect(nextTargetWeight('bulk', 70, 68, true)).toBe(73.5);
  });

  it('respeta el peso meta elegido al volver a "tu cuerpo"', () => {
    const s = create();
    s.next();
    s.setSex('male');
    s.setWeight(90);
    s.next();
    s.setTargetWeight(80);
    s.back();
    s.next();
    expect(s.targetWeightKg()).toBe(80);
  });

  it('bloquea un peso meta en la dirección equivocada', () => {
    const s = create();
    s.next();
    s.setSex('male');
    s.setWeight(80);
    s.next();
    s.setTargetWeight(85);
    expect(s.next()).toBe(false);
    expect(s.visibleErrors()).toEqual(['wrongDirectionCut']);
    s.setGoal('maintain');
    expect(s.next()).toBe(true);
  });

  it('exige una dieta y combina restricciones', () => {
    const s = create();
    s.next();
    s.setSex('female');
    s.next();
    s.next();
    expect(s.step()).toBe('diet');
    expect(s.next()).toBe(false);
    expect(s.visibleErrors()).toEqual(['dietRequired']);

    s.setDiet('vegan');
    s.toggleRestriction('gluten_free');
    s.toggleRestriction('lactose_free');
    s.toggleRestriction('lactose_free');
    expect(s.restrictions()).toEqual(['gluten_free']);
    expect(s.next()).toBe(true);
    expect(s.step()).toBe('ready');
  });

  it('arma el perfil solo al final', () => {
    const s = create();
    expect(s.toProfile()).toBeNull();
    s.setName('  Leandro ');
    s.next();
    s.setSex('male');
    s.next();
    s.next();
    s.setDiet('keto');
    s.next();
    const p = s.toProfile();
    expect(p).toMatchObject({
      name: 'Leandro',
      sex: 'male',
      diet: 'keto',
      restrictions: [],
      mealsPerDay: 4,
      units: 'metric',
    });
  });

  it('volver atrás no pierde lo cargado y limpia los errores', () => {
    const s = create();
    s.next();
    s.next();
    expect(s.visibleErrors().length).toBeGreaterThan(0);
    s.back();
    expect(s.step()).toBe('hello');
    expect(s.visibleErrors()).toEqual([]);
  });

  it('guarda un borrador y lo retoma si la app se cerró', () => {
    const first = create();
    first.next();
    first.setSex('female');
    first.setWeight(62);
    TestBed.flushEffects();
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
    expect(saved).toMatchObject({ step: 'body', sex: 'female', weightKg: 62 });

    TestBed.resetTestingModule();
    const again = create();
    expect(again.step()).toBe('body');
    expect(again.weightKg()).toBe(62);
  });
});
