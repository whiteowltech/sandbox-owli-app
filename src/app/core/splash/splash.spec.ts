import { dismissSplash } from './splash';

function mount(): HTMLElement {
  document.body.innerHTML = '<div id="owli-splash"></div>';
  return document.getElementById('owli-splash')!;
}

describe('dismissSplash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('espera a que termine la secuencia, sale con un fundido y se quita', () => {
    vi.spyOn(performance, 'now').mockReturnValue(300);
    const el = mount();
    dismissSplash();
    vi.advanceTimersByTime(700);
    expect(el.classList.contains('out')).toBe(false);
    vi.advanceTimersByTime(100);
    expect(el.classList.contains('out')).toBe(true);
    vi.advanceTimersByTime(320);
    expect(document.getElementById('owli-splash')).toBeNull();
  });

  it('si la app tardó más que la secuencia, sale enseguida', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2500);
    const el = mount();
    dismissSplash();
    vi.advanceTimersByTime(0);
    expect(el.classList.contains('out')).toBe(true);
  });

  it('un toque la saltea', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const el = mount();
    dismissSplash();
    el.dispatchEvent(new Event('pointerdown'));
    expect(el.classList.contains('out')).toBe(true);
  });

  it('sin presentación en la página, no hace nada', () => {
    document.body.innerHTML = '';
    expect(() => dismissSplash()).not.toThrow();
  });
});
