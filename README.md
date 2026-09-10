# ETOTU · Orbital Arcade

Arcade espacial en español, hecho con HTML, CSS y Canvas 2D. No necesita compilación ni dependencias de JavaScript.

## Ejecutar

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
- Recoge los orbes verdes para recuperar una carga; si el escudo está lleno, obtienes 50 puntos.
- Destruye enemigos (100 puntos; 250 para los pesados) y completa oleadas (150 × número de oleada).
- Activa música y efectos con el botón de sonido. El audio empieza después de una interacción.

El récord, la nave elegida y la preferencia de audio se guardan localmente en el navegador. El juego sigue funcionando si el almacenamiento no está disponible.

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
