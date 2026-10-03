# Conversor de temperatura

Aplicación web educativa para convertir temperaturas entre **Celsius (°C)**, **Kelvin (K)**, **Fahrenheit (°F)** y **Rankine (°R)**. Muestra la fórmula aplicada con los valores sustituidos, valida el cero absoluto y guarda un historial de la sesión.

Solo usa HTML5, CSS3 y JavaScript puro. No necesita servidor, instalación ni conexión a internet.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura y contenido educativo |
| `styles.css` | Estilos, modo claro/oscuro y diseño responsive |
| `script.js` | Lógica de conversión (funciones puras) e interfaz |
| `tests.js` | Pruebas opcionales de la lógica (requieren Node.js) |
| `README.md` | Estas instrucciones |

## 1. Abrir la aplicación en tu computador

1. Descomprime el ZIP en una carpeta.
2. Haz doble clic en `index.html`. Se abre en tu navegador.

No hace falta instalar nada.

## 2. Subir los archivos a un repositorio de GitHub

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Haz clic en **New** (nuevo repositorio), escribe un nombre (por ejemplo `conversor-temperatura`) y déjalo **Public**.
3. Haz clic en **Create repository**.
4. En la página del repositorio, elige **uploading an existing file**.
5. Arrastra los archivos descomprimidos (`index.html`, `styles.css`, `script.js`, `README.md`, `tests.js`) a la ventana. Deben quedar en la raíz del repositorio, sin carpetas intermedias.
6. Haz clic en **Commit changes**.

## 3. Activar GitHub Pages

1. En el repositorio, abre **Settings → Pages**.
2. En **Build and deployment → Source**, elige **Deploy from a branch**.
3. En **Branch**, selecciona `main` y la carpeta `/ (root)`. Haz clic en **Save**.
4. Espera uno o dos minutos y recarga la página. GitHub mostrará la dirección pública, con esta forma:
   `https://TU-USUARIO.github.io/conversor-temperatura/`

## Cómo funciona

- **Conversión automática** mientras escribes, o con el botón **Convertir** (también con Enter). Convertir y Enter registran la conversión en el historial.
- **Decimales:** acepta coma o punto. El resultado se redondea solo al mostrarlo (2 decimales por defecto, de 0 a 6).
- **Cero absoluto:** se rechazan valores menores a -273.15 °C, 0 K, -459.67 °F y 0 °R.
- **Fórmula:** toda conversión pasa primero por Celsius, sin redondeos intermedios.
- **Historial:** últimas 10 conversiones, solo en memoria. Se pierde al recargar la página.
- **Tema:** respeta la preferencia del sistema (claro u oscuro) y se puede alternar con el botón. El movimiento reducido del sistema también se respeta.
- **Botón ±:** cambia el signo del valor. Es útil en celulares cuyo teclado numérico no tiene el signo menos.

## Pruebas de la lógica (opcional)

Con Node.js instalado, desde la carpeta del proyecto:

```
node tests.js
```

El resultado indica cuántas pruebas pasaron. Cubren los puntos de referencia, el cero absoluto, entradas inválidas, el formato de números y los pasos de la fórmula.
