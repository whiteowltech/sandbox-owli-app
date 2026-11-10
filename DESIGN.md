# DESIGN.md — cómo se ve y se mueve Owli

Reglas para que cada pantalla nueva salga coherente con las demás y no parezca una plantilla. Los valores viven en `src/theme/variables.scss` (tokens `--owli-*`): **no se escriben colores, tamaños de letra ni radios sueltos en los componentes**.

## Idea

Un bosque de noche: fondo verde muy oscuro, superficies que suben de tono y un búho con ojos ámbar. La personalidad la pone Owli, no la interfaz: la interfaz es tranquila, legible y rápida.

## Color

| Token | Uso |
|---|---|
| `--owli-pino` | Fondo de la app |
| `--owli-corteza-baja` | Listas y bloques dentro de una pantalla |
| `--owli-corteza` | Controles: botones de ícono, campos, opciones |
| `--owli-corteza-alta` | Selección dentro de un control, avisos flotantes (deshacer) |
| `--owli-linea` / `--owli-borde` | Separadores de lista / bordes de controles |
| `--owli-luna` · `--owli-pluma` · `--owli-texto-terciario` | Texto principal, secundario y metadatos |
| `--owli-ojo` (ámbar) | **Solo** la acción principal, lo que se puede tocar como enlace y la proteína |
| `--owli-liquen` | Éxito y carbohidratos |
| `--owli-luna-azul` | Grasa |
| `--owli-ambar-velo` / `--owli-ambar-aviso` | Fondo de lo recién anotado o seleccionado / de un aviso |
| `--owli-brasa*` | Acciones destructivas (borrar la cuenta). Nada más |

- La profundidad se marca con el **tono** de la superficie, no con sombras. No hay sombras grises bajo las tarjetas.
- Sin degradés decorativos, sin brillos ni efectos de "vidrio".
- Un estado nunca se marca solo con color: va con texto, un borde o `aria-pressed`.

## Tipografía

Una sola familia, **Atkinson Hyperlegible Next**, porque se lee bien con poca luz y con números. La jerarquía sale del tamaño y el peso.

| Token | Tamaño | Uso |
|---|---|---|
| `--owli-t-display` | 44 | El número del día (una vez por pantalla) |
| `--owli-t-titulo` | 22 | Título de pantalla |
| `--owli-t-destacado` | 17 | Nombres (comidas, platos), lo que dice Owli, acciones |
| `--owli-t-cuerpo` | 15 | Texto secundario, explicaciones |
| `--owli-t-nota` | 13 | Gramos, hora, etiquetas de macros |

- Los números van con `.num` (cifras tabulares) para que no salten al contar.
- Nada en MAYÚSCULAS como etiqueta; títulos en minúscula de oración ("Tu día").
- Pesos: 400 texto, 600–700 nombres y títulos, 800 solo el número grande y la acción principal.

## Forma

Los radios crecen con el tamaño del contenedor; no todo lleva el mismo redondeo.

| Token | Radio | Uso |
|---|---|---|
| `--owli-r-s` | 8 | Algo dentro de otro control (segmento activo) |
| `--owli-r-m` | 12 | Botones de ícono, opciones, avisos, campos |
| `--owli-r-l` | 16 | Listas y bloques |
| `--owli-r-xl` | 20 | Acción principal (Foto) |
| `--owli-r-hoja` | 24 | Borde superior de las hojas |

- Una serie de cosas del mismo tipo (las comidas del día) es **una lista**: un bloque con filas y separadores, no tarjetas sueltas iguales.
- Los estados vacíos son Owli hablando (texto), no una tarjeta.
- Áreas táctiles de 44 px como mínimo.

## Movimiento

El movimiento responde a algo que hizo la persona o muestra qué cambió. Nada se mueve "porque sí".

| Token | Valor | Uso |
|---|---|---|
| `--owli-dur-rapida` | 150 ms | Presionar, cambios de estado |
| `--owli-dur` | 220 ms | Salidas, fundidos |
| `--owli-dur-entrada` | 320 ms | Pantallas, hojas y listas que entran |
| `--owli-ease` | frenado suave | Casi todo lo que entra |
| `--owli-ease-salida` | acelera | Lo que se va |
| `--owli-resorte` | rebote chico | Solo lo que "llega": comida nueva, festejo |

- Al abrir la app: la presentación de `index.html` (luna, Owli que aterriza, el nombre; ~1,1 s contando la carga). Después Owli vuela hasta el Owli de la primera pantalla mientras el fondo se apaga (`core/splash/splash.ts`). Se saltea con un toque. Es el único momento "de ceremonia" de la app.
- Entre pantallas: `shared/motion/page-transition.ts` (corrimiento corto + fundido; el gesto de volver de iOS lo sigue con el dedo).
- Listas: entran en cascada (40–45 ms entre filas, máximo 6 escalones) solo la primera vez; después solo se resalta lo nuevo.
- Números: cuentan hasta su valor con `tweened()` (`shared/motion/motion.ts`).
- Hojas: suben al abrir y se cierran arrastrando (`owliSheetDrag`).
- Todo lo que se presiona se hunde a 0,97.
- Vibración (`HapticsService`): `tap()` al guardar y `success()` al cerrar el día. No en cada toque.
- "Reducir movimiento" lo apaga todo (regla global en `global.scss`).
- Animaciones de Angular (`animate.enter` / `animate.leave` con clases CSS). No se usa `@angular/animations` ni librerías de animación.

## Owli

- Es el único elemento ilustrado y el único que tiene "personalidad" visual. Lo demás no compite con él.
- Hoy es una imagen por estado de ánimo (`shared/owl`). La versión animada (Rive) lo reemplaza en ese mismo componente.
- Su texto sale de plantillas, en primera persona y corto.

## Evitar (lo que hace que una app parezca hecha por IA)

- Tarjetas idénticas con el mismo radio y la misma sombra para todo.
- Texto que brilla, que se escribe solo letra por letra, haces de luz, degradés de fondo.
- Etiquetas en mayúsculas espaciadas sobre cada título.
- Animaciones de entrada en cada sección al abrir una pantalla.
- Colores, tamaños o radios que no salgan de los tokens.

## Pendiente de pasar a los tokens

Hoy, las hojas de Hoy y las piezas compartidas (`theme/ui.scss`) ya usan la escala. Onboarding, Tu semana y Tu cuenta usan los colores de los tokens, pero todavía tienen tamaños de letra y radios escritos a mano. Se pasan cuando se toque cada pantalla.
