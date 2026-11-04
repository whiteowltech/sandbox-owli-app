import { formatHeight, formatWeight } from './units';

describe('unidades', () => {
  it('muestra el peso en kg con la coma o el punto del idioma', () => {
    expect(formatWeight(75.5, 'metric', 'es')).toBe('75,5 kg');
    expect(formatWeight(75.5, 'metric', 'en')).toBe('75.5 kg');
    expect(formatWeight(80, 'metric', 'es')).toBe('80 kg');
  });

  it('convierte el peso a libras redondeando', () => {
    expect(formatWeight(80, 'imperial', 'en')).toBe('176 lb');
    expect(formatWeight(0.5, 'imperial', 'en')).toBe('1 lb');
  });

  it('muestra la altura en cm o en pies y pulgadas', () => {
    expect(formatHeight(175, 'metric')).toBe('175 cm');
    expect(formatHeight(175, 'imperial')).toBe('5′ 9″');
    expect(formatHeight(183, 'imperial')).toBe('6′ 0″');
  });
});
