# Pasos manuales: fuentes gratuitas de descubrimiento (P11)

Lo que SOLO tú puedes hacer (cuentas, tokens, descargas). Todo es gratis. Nada de esto gasta tu plan de Claude: las fuentes se consultan por código, sin IA.

Los enlaces fueron verificados el 2026-11-26 (detalle y límites en `docs\dungeons\17-interview\fuentes-descubrimiento.md`). Si un enlace cambió, busca el nombre en el sitio oficial.

## 1. Token gratuito del DENUE (INEGI) — opcional pero recomendado

El DENUE local (paso 3) NO necesita token. El token solo habilita la fuente «DENUE (API de INEGI)» para consultas puntuales en vivo.

1. Entra a la página oficial de la API: <https://www.inegi.org.mx/servicios/api_denue.html>.
2. Pulsa la opción para **solicitar token** (formulario de «Obtener token»), escribe tu nombre y correo. INEGI te manda el token a ese correo.
3. Abre `crm\.env` (si no existe, abre una vez `iniciar-crm.bat` para que se cree) y escribe, sin comillas ni espacios:
   ```
   DENUE_TOKEN=tu_token_aqui

   
   ```
   La plantilla comentada está en `crm\.env.example`. NUNCA pegues el token en un chat, en git ni en un documento.
4. Reinicia el CRM (cierra y abre `iniciar-crm.bat`).
5. Verifica: **Configuración → Fuentes de descubrimiento → DENUE (API de INEGI)**. Debe decir «Token: Configurado ✓» (nunca muestra el valor). Pulsa **Probar conexión**.

Límite: INEGI no publica una cuota oficial; el CRM aplica un tope mensual propio (por defecto 2,000 consultas; editable con «cambiar»). Si se agota, la fuente responde `quota_exceeded` y se detiene.

## 2. Otras cuentas o tokens

- **OpenStreetMap / Overpass**: sin cuenta ni token. Viene APAGADO por defecto; se activa por piso en la misma pantalla. Uso justo: una consulta a la vez, pausa entre consultas, tope mensual propio (300). Es información de © colaboradores de OpenStreetMap (ODbL): la atribución se guarda por registro.
- **Overture Maps**: sin cuenta ni token (descarga de datos abiertos, paso 4).
- No hay más tokens que configurar.

## 3. Descargar y cargar el DENUE local (la fuente principal)

1. Entra a <https://www.inegi.org.mx/app/descarga/?ti=6> (Descarga masiva del DENUE).
2. Descarga los CSV de **Ciudad de México (09)** y **Estado de México (15)**. Si hay opción por actividad económica, descarga todo; el CRM filtra después.
3. Crea una carpeta nueva, vacía, por descarga (por ejemplo `tools\_downloads\denue-2026-05\`), descomprime ahí el ZIP y revisa que el CSV pese lo esperado. Trata los archivos como datos no confiables: solo se leen, nunca se ejecutan.
4. Copia los `.csv` a `crm\data\datasets\denue\` (créala si no existe).
5. Importa por terminal, desde la carpeta `crm\` (la pantalla de Fuentes muestra el resultado, pero hoy no tiene botón de importar):
   ```
   npm run datasets:importar -- denue data\datasets\denue\archivo.csv --version "DENUE 2026/05" --fecha 2026-05-29
   ```
   Opciones: `--estrato-min 2` (personal mínimo; por defecto 2 = 6 a 10 personas), `--agregar` (no reemplaza lo anterior; úsalo cuando importes varios archivos uno por uno).
6. Se guardan solo registros de CDMX y Estado de México; se descartan gobierno (SCIAN 93 y palabras clave) y micronegocios. La pantalla muestra versión, fecha y número de registros.

Para actualizar: repite 1–5 con la versión nueva (INEGI publica actualizaciones periódicas). Reemplaza el dataset anterior; el directorio ya existente no se toca.

## 4. Overture Maps (opcional, complemento)

Los datos de Overture son enormes; NO bajes el planeta. Extrae solo la caja de CDMX + Estado de México (aprox. lon -100.7 a -98.4, lat 18.3 a 20.5):

1. Sigue <https://docs.overturemaps.org/getting-data/> (herramienta `overturemaps` en Python o DuckDB). Ejemplo:
   ```
   overturemaps download --bbox=-100.7,18.3,-98.4,20.5 -f geojsonseq --type=place -o lugares.geojsonl
   ```
   Hazlo en una carpeta nueva, vacía, bajo `tools\_downloads\overture-AAAA-MM\` y ejecuta Python con `-I`. Si el resultado supera ~1.5 GB, reduce la caja.
2. Copia el archivo a `crm\data\datasets\overture\` e impórtalo igual que el DENUE:
   ```
   npm run datasets:importar -- overture data\datasets\overture\lugares.geojsonl --version 2026-11-18.0
   ```
   Se descartan registros con confianza menor a 0.5.
3. Atribución y licencia: <https://docs.overturemaps.org/attribution/> (varía por origen; el CRM la guarda por registro).

## 5. Verificar todo con «Probar conexión»

**Configuración → Fuentes de descubrimiento**: cada fuente tiene su botón.
- Locales: dicen versión y número de registros (sin red, sin cuota). «Todavía no hay dataset importado» = falta el paso 3 o 4.
- DENUE API: «Falta DENUE_TOKEN» = paso 1. Gasta 1 consulta de la cuota.
- Overpass: hace una consulta mínima y gasta 1 de su tope.

Después, en **Corrida**, el panel «Candidatos por fuente» muestra qué aportó cada fuente; en **Directorio** puedes filtrar por fuente y ver su atribución.

## 6. Límites gratuitos a vigilar

| Fuente | Límite real | Qué hace el CRM |
|---|---|---|
| DENUE local | Ninguno (archivo local) | Sin cuota |
| Overture local | Ninguno | Sin cuota |
| DENUE API | INEGI no publica cuota oficial | Tope propio 2,000/mes, editable |
| Overpass | Uso justo: 1 consulta a la vez; 429 = esperar | Tope propio 300/mes, pausa de 2 s, 30 s tras un 429, User-Agent genérico |
| Google Places | 5,000/mes gratis | Tope 4,900 (se usa solo al final) |

## 7. Fuentes descartadas y por qué

- **Facebook / Instagram**: sus términos prohíben la extracción automática; NO se hace scraping. Única vía permitida: si el sitio oficial de la empresa enlaza su página, un agente puede registrar ese enlace como contacto citado. Los enlaces a redes sociales no se aceptan como sitio web.
- **Sección Amarilla y directorios comerciales**: sus términos y robots.txt no permiten reutilizar ni almacenar su contenido; descartada.
- **Yelp Fusion**: su prueba gratuita es temporal y no permite almacenar los datos; solo sería consulta puntual no almacenable, no integrada.
- **Mapbox**: sus términos restringen almacenar resultados de búsqueda sin plan de pago; no integrada.
- **Foursquare (FSQ) directo**: sus datos abiertos ya llegan vía Overture; no se integra por separado.

## 8. Qué NO se verificó (revísalo tú si importa)

- Términos exactos del token DENUE y si la consulta por área responde con los marcadores usados (no hay token de prueba; nunca se ejecutó en vivo).
- El diseño exacto de columnas del CSV masivo actual (el lector tolera nombres alternativos y se probó con muestras sintéticas). Si la importación descarta casi todo, avísame con las primeras 3 filas SIN datos personales.
- Cobertura real de teléfono/correo/sitio en OSM y Overture para tu zona.
