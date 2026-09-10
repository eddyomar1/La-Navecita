# ETOTU · Orbital Arcade

Arcade espacial en español, hecho con HTML, CSS y Canvas 2D. No necesita compilación ni dependencias de JavaScript.

## Jugar en línea

[Jugar La Navecita en GitHub Pages](https://eddyomar1.github.io/La-Navecita/)

## Ejecutar localmente

Abre `index.html` en un navegador moderno, o sirve la carpeta:

```sh
python3 -m http.server 8080
```

Visita `http://localhost:8080`.

## Cómo jugar

- Elige **Vanguard**, con mayor potencia, o **Spectre**, con mayor velocidad.
- Inicia la misión con el botón o Enter. La nave dispara automáticamente.
- Muévete con WASD, las flechas o arrastrando sobre el campo de juego.
- Pulsa P, Escape o el botón de pausa para detener la partida. Cambiar de pestaña o ventana también pausa el juego.
- Tienes tres cargas de escudo. Los impactos y los enemigos que cruzan la frontera inferior consumen una carga. Tras recibir daño tienes un breve período de protección.
- Recoge los Nanobots para recuperar escudo (2 cargas con Vanguard; 1 con Spectre). Si ya está lleno, obtienes 50 puntos.
- Pulsa **F** o el botón de las cuatro esquinas para entrar o salir de pantalla completa. En navegadores sin soporte, el juego ocupa toda la ventana. Escape permite salir; la partida puede quedar pausada.
- Destruye enemigos (100 puntos; 250 para los pesados) y completa oleadas (150 × número de oleada).
- Activa música y efectos con el botón de sonido. El audio empieza después de una interacción.

El récord, la nave elegida y la preferencia de audio se guardan localmente en el navegador. El juego sigue funcionando si el almacenamiento no está disponible.

## Jefes y equipamiento

El GIF original `marcianito-real-no-fake.gif` aparece animado como **El Marcianito** en la oleada **10** (180 de salud, 3.000 puntos) y como **Marcianito Supremo** en la **100** (1.400 de salud, 25.000 puntos). Estas oleadas sustituyen a los enemigos normales y solo terminan al derrotar al jefe. Ambos disparan abanicos dirigidos; al llegar al 50 % de salud aumentan su cadencia y añaden anillos de proyectiles. La variante suprema tiene patrones más densos. La barra superior muestra su salud.

Los suministros aparecen cada 12 segundos (cada 8 contra un jefe) y recorren los cinco tipos; los enemigos también pueden soltar objetos. Se activan al recogerlos. Un objeto repetido renueva su duración, sin acumularla; las habilidades diferentes se combinan. La pausa congela los temporizadores y el reinicio elimina todos los efectos.

| Objeto | Vanguard | Spectre |
| --- | --- | --- |
| **+ Nanobots** | Recupera 2 cargas y protege durante 2 s. | Recupera 1 carga y activa fase durante 4 s. |
| **W Arsenal** | Dos disparos paralelos de 3 de daño, 10 s. | Tres disparos en abanico de 1 de daño, 10 s. |
| **» Propulsor** | Cadencia un 82 % mayor, 8 s. | Velocidad +55 %; enemigos y proyectiles hostiles un 45 % más lentos, 8 s. |
| **O Barrera** | Absorbe 3 impactos; caduca a los 10 s. | Fase sin recibir daño, 5 s. |
| **\* Núcleo** | Elimina disparos hostiles y causa 12 de daño a cada enemigo y 35 al jefe. | Dron con proyectiles guiados de 3 de daño, 12 s. |

El equipamiento bajo el hangar se actualiza al seleccionar nave; la franja bajo el juego muestra efectos activos, segundos restantes y cargas de blindaje. La cantidad de enemigos por oleada tiene un máximo de 36; la resistencia de enemigos comunes también tiene un límite para mantener viables las oleadas altas.

## Rayo sísmico · Reliquia del jefe 10

Al derrotar al jefe de la oleada **10**, aparece una reliquia turquesa **ϟ**. Debes recogerla para desbloquear el ataque. No sale de enemigos normales, suministros ni del jefe 100; permanece en el borde inferior si no la recoges al caer.

- **Activación:** mantén **R**, o el botón del rayo en móvil, durante **3 segundos continuos**. Puedes seguir moviéndote mientras cargas. Soltar antes, pausar o cambiar de pantalla cancela la carga sin gastar usos.
- **Límite:** **5 descargas por partida**, compartidas por la nave elegida. No se recargan ni se conservan al reiniciar.
- **Espera:** **60 segundos de juego entre descargas**, desde el momento del disparo. La pausa congela este tiempo. Debes soltar y volver a mantener la tecla o el botón para una nueva descarga; mantenerlo no repite el ataque automáticamente.
- **Potencia:** haz vertical de 180 unidades de ancho hacia arriba desde la posición donde disparaste, durante 1,6 s. Inflige 80 de daño por enemigo y 500 al jefe, una sola vez por objetivo en cada descarga. Elimina proyectiles hostiles dentro del haz y protege la nave durante la descarga.
- **Presentación:** utiliza el `rayo.png` original, con núcleo azul, ramificaciones turquesas, brillo y sacudida de cámara decreciente. La preferencia de movimiento reducido desactiva la sacudida. El panel muestra usos restantes, progreso de carga y espera.

## Pruebas del motor

Requieren Node.js con `node:test`, sin instalar dependencias:

```sh
node tests/game.test.cjs
```

Cubren las dos oleadas de jefe, ataques y daño, bloqueo del avance, los cinco objetos para ambas naves, recolección, caducidad y reinicio. También verifican la exclusividad de la reliquia, la carga continua, cancelación, cinco usos máximos, espera de 60 segundos, daño del haz y conservación del objeto al caer. La prueba carga el motor en un entorno aislado; no introduce atajos ni acceso al estado interno en el juego publicado.

## Archivos

- `index.html`: interfaz, hangar, indicadores e instrucciones.
- `styles.css`: diseño adaptable, estados y preferencias de movimiento reducido.
- `magia.js`: bucle de animación, controles, colisiones, oleadas, audio y persistencia.
- `*.png`, `*.gif`, `playsong.ogg`: recursos originales del proyecto. El planeta, el fondo y los efectos se dibujan con Canvas.

Las fuentes de Google Fonts son opcionales; hay fuentes de sistema de respaldo. Los gráficos y la música se sirven desde el proyecto.

## Comprobación manual

1. Elige ambas naves y comprueba que la selección persiste al recargar.
2. Inicia una misión, mueve la nave en diagonal y comprueba el disparo automático.
3. Pausa y reanuda con teclado y botón; abre las instrucciones durante una partida.
4. Cambia de pestaña: la misión debe quedar pausada.
5. Termina una partida, reinicia y comprueba que el escudo y los puntos se restablecen, conservando el récord.
6. En móvil, arrastra la nave, suelta el dedo y comprueba que se detiene. Verifica que no aparece desplazamiento horizontal.

7. Prueba F y el botón de pantalla completa, tanto para entrar como para salir; en móvil cambia la orientación.
8. Recoge cada tipo de objeto con ambas naves y compara sus efectos con el equipamiento. Pausa y comprueba que los segundos restantes no cambian.
9. En las oleadas 10 y 100, comprueba la animación, la barra de salud, la fase de furia y el paso a la siguiente oleada al derrotar al jefe.

10. Recoge la reliquia del jefe 10. Mantén R menos de 3 s y suelta: no debe gastar usos. Mantén 3 s: debe disparar, sacudir la escena y descontar uno. Verifica los 60 s de espera y el botón táctil.
