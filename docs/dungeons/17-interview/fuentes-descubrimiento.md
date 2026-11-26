# Fuentes de descubrimiento gratuitas (Capa 17: investigación y decisión)

Fecha de la investigación: **2026-11-26**. Zona piloto: CDMX + Estado de México. Reglas del dueño: solo fuentes y capas **gratuitas**, sin gobierno, los agentes nunca contactan prospectos, sin precios. Objetivo: no depender solo de Google Places.

Método: lectura de páginas oficiales (WebFetch/WebSearch) y comprobaciones directas (robots.txt, cabeceras). Lo que no pude confirmar con una fuente oficial se marca **NO VERIFICADO**. Esto no es asesoría legal.

## Matriz de decisión (resumen)

| # | Fuente | Veredicto | Motivo corto |
|---|---|---|---|
| 1 | **DENUE (INEGI)** | **INTEGRAR** (dataset local + API con token) | Libre uso con atribución, trae SCIAN y estrato de personal, teléfono/correo/sitio cuando existen, coordenadas. |
| 2 | **OpenStreetMap + Overpass** | **INTEGRAR CON RESTRICCIONES** | ODbL: atribución y share-alike si se publica la base; uso interno OK; Overpass público con límites justos y consultas de una en una. Cobertura B2B irregular. |
| 3 | **Overture Maps Places** | **INTEGRAR CON RESTRICCIONES** (dataset local, extracción manual) | Licencias permisivas por origen (CDLA-Permissive 2.0, Apache 2.0, CC0); se atribuye por registro. Requiere un paso manual de extracción (parquet). |
| 4 | **Foursquare OS Places** | **NO INTEGRAR directo** | Apache 2.0, pero el acceso actual exige cuenta en el Places Portal + catálogo Iceberg; además ya viene dentro de Overture (transformado). Se cubre vía Overture. |
| 5 | **Yelp Fusion** | **NO INTEGRAR** (a lo sumo «consulta puntual no almacenable») | Prueba gratuita temporal; su guía permite cachear 24 h y solo IDs para emparejar; no entrega el sitio web del negocio. No sirve para un directorio propio. |
| 6 | **Mapbox Search** | **NO INTEGRAR** («consulta puntual no almacenable») | Resultados de Search Box «solo uso temporal»; almacenar exige contrato con ventas; sin capa gratuita documentada. |
| 7 | **Sección Amarilla** | **NO INTEGRAR** | robots.txt no bloquea, pero no hay permiso explícito de reutilizar/almacenar su base y su aviso legal solo trata confidencialidad contractual. Regla del dueño: sin permiso explícito, se descarta. |
| 8 | **Facebook / Instagram** | **NO INTEGRAR** (solo vía enlace citado del sitio oficial) | Condiciones de Meta prohíben la recolección automatizada; choca con la regla «sin redes sociales». |

Prioridad esperada por el dueño (DENUE > OSM > Overture > FSQ): **confirmada**, con una corrección: FSQ no se integra aparte porque Overture ya incluye sus lugares y el acceso directo es más pesado.

## Ficha por fuente

### 1. DENUE (INEGI)

- **Datos**: nombre, razón social, clase de actividad (SCIAN), **estrato de personal ocupado** (códigos 1 a 7), tipo/nombre de vialidad, número, colonia, CP, municipio/entidad, **teléfono, correo, sitio de internet** (cuando existen), tipo de establecimiento, **longitud y latitud**, fecha de alta. Campos JSON de la API: `CLEE, Id, Nombre, Razon_social, Clase_actividad, Estrato, Tipo_vialidad, Calle, Num_Exterior, Num_Interior, Colonia, CP, Ubicacion, Telefono, Correo_e, Sitio_internet, Tipo, Longitud, Latitud` (+ `Fecha_Alta`, `AreaGeo` en BuscarAreaAct). Estratos: 1 = 0 a 5, 2 = 6 a 10, 3 = 11 a 30, 4 = 31 a 50, 5 = 51 a 100, 6 = 101 a 250, 7 = 251 y más.
- **Cobertura CDMX/Edomex**: nacional (más de 5 millones de establecimientos desde 2017); la actualización 2026/05 se publicó el 20 de mayo de 2026 y se corrigió el 29 de mayo de 2026 (nota técnica de INEGI). Cobertura de teléfono/correo/sitio: parcial (campo opcional).
- **Capa gratuita y límites**: la API se consulta con un **token gratuito** (registro en el sitio de INEGI; el token llega por correo; **la gratuidad del token y el plazo de entrega no están dichos en la página de la API: NO VERIFICADO hasta que el dueño haga el registro**). Único límite documentado: 5,000 m de radio en `Buscar`. No hay cuota numérica publicada (**NO VERIFICADO**; aplicamos un tope propio configurable). Métodos útiles: `BuscarAreaAct` (entidad/municipio/actividad/nombre, paginado `reg_ini/reg_fin`), `Cuantificar`, `Ficha`, `Nombre`.
- **Descarga masiva**: existe una herramienta oficial («Descarga masiva», `DescargaMasivaApp.exe`, zip de ~600 KB) que baja los archivos a la carpeta elegida, con filtro por área geográfica. **No pude automatizar la descarga** (la página es dinámica y la lista de archivos se arma por una API interna; no la usé para no evadir el sitio). Por eso el importador lee **CSV que el dueño descarga a mano** (pasos en `PASOS-MANUALES-FUENTES.md`) y la API cubre consultas puntuales.
- **Licencia y términos**: «Términos de libre uso de la información del INEGI»: permite copiar, adaptar, reordenar y **explotar comercialmente** la información como insumo de otros productos; exige **dar crédito** («Fuente: INEGI, DENUE, fecha de actualización»), informar de las transformaciones y no sugerir respaldo del INEGI. Compatible con un directorio propio.
- **Esfuerzo**: medio (CSV + API). **Valor B2B**: el más alto, porque trae tamaño de personal y SCIAN para filtrar micronegocios sin gastar IA.
- Fuentes: https://www.inegi.org.mx/servicios/api_denue.html · https://www.inegi.org.mx/inegi/terminos.html · https://www.inegi.org.mx/app/descarga/?ti=6 (consultadas 2026-11-26).
- **Veredicto: INTEGRAR.** Excluir SCIAN sector 93 (actividades legislativas, gubernamentales y de impartición de justicia) y palabras clave de gobierno.

### 2. OpenStreetMap + Overpass API

- **Datos**: nombre, dirección parcial (`addr:*`), teléfono (`phone`/`contact:phone`), correo (`email`/`contact:email`), sitio (`website`/`contact:website`), categoría por etiquetas (`shop`, `office`, `craft`, `industrial`, `amenity`), coordenadas. **No hay tamaño de personal.**
- **Cobertura**: buena en comercios y servicios de CDMX, irregular en Edomex y en naves industriales. Contactos solo cuando algún mapeador los agregó (**cobertura real NO VERIFICADA**; se medirá en la prueba LIVE).
- **Capa gratuita**: la instancia pública `overpass-api.de` indica: menos de 10,000 consultas/día, menos de 1 GB/día, menos de 10 minutos de proceso/día (y «para uso regular, dividir entre 100»); **no ejecutar consultas en paralelo**; ante HTTP 429/406 esperar 30 s; se pide `User-Agent`/`Referer` que identifique la aplicación; el uso comercial intensivo debe ir a un servidor propio o de pago; está sobrecargada y puede fallar. Timeout por defecto 3 minutos.
- **Licencia**: **ODbL 1.0**. Atribución («© colaboradores de OpenStreetMap») y, si se **publica** una base derivada, share-alike y mantenerla abierta. El resumen oficial liga las obligaciones al uso/redistribución **público**; el uso interno en un CRM privado no parece activarlas, pero **no se redistribuye** el directorio. Se guarda la atribución por registro y se muestra en la UI.
- **Esfuerzo**: bajo (HTTP + JSON). **Valor B2B**: medio-bajo; útil para contactos/sitio y para cruzar con DENUE.
- Fuentes: https://wiki.openstreetmap.org/wiki/Overpass_API · https://www.openstreetmap.org/copyright · https://opendatacommons.org/licenses/odbl/summary/ (2026-11-26).
- **Veredicto: INTEGRAR CON RESTRICCIONES**: una consulta a la vez, pausa mínima entre consultas, timeout de 25 s, tope diario propio muy por debajo del límite, User-Agent genérico (`acitmx-prospecting-crm/1.0`, sin datos personales), degradar a `sin_datos` si falla, no redistribuir la base.

### 3. Overture Maps Places

- **Datos** (esquema `place`): nombres, **teléfonos, correos, sitios web, redes sociales** (`socials`), direcciones (con `postcode`, `region`), categoría (`basic_category`, `taxonomy`), `confidence` 0 a 1 (0 = cerrado permanentemente), coordenadas. Sin tamaño de personal.
- **Cobertura**: global; procede de Meta, Microsoft, Foursquare, AllThePlaces y otros. Cobertura de contactos en México **NO VERIFICADA** (se medirá al importar una muestra).
- **Capa gratuita**: datos abiertos en S3 (`s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/*`); se extrae por **bbox** con `pip install overturemaps` + `overturemaps download --type=place --bbox=... -f geojsonseq` (lee solo la caja pedida) o con DuckDB. Equipo del dueño: sin DuckDB/pyarrow instalados, así que la extracción es un **paso manual en un entorno virtual** aparte; el CRM importa el GeoJSON Lines resultante, sin dependencias nuevas.
- **Licencia**: sin licencia única para el tema Places; **por fuente**: Meta, Microsoft y otros bajo **CDLA Permissive 2.0**; Foursquare bajo **Apache 2.0** (con NOTICE); AllThePlaces **CC0**. Son permisivas (permiten almacenar y reutilizar; conservar avisos de licencia). Se guarda `sources[].dataset` y su licencia por registro como atribución. (Texto legal completo de CDLA/Apache: no copiado aquí; la página de atribución de Overture solo da los nombres.)
- **Esfuerzo**: medio (extracción manual + importador). **Valor B2B**: medio (más cobertura y contactos; confianza para filtrar).
- Fuentes: https://docs.overturemaps.org/attribution/ · https://docs.overturemaps.org/getting-data/ · https://docs.overturemaps.org/schema/reference/places/place/ (2026-11-26).
- **Veredicto: INTEGRAR CON RESTRICCIONES** (solo desde un archivo que el dueño extrae por bbox y estado; se filtra a `region` MX-CMX / MX-MEX).

### 4. Foursquare OS Places

- **Datos**: `tel`, `email`, `website`, `address`, `latitude/longitude`, `fsq_category_ids/labels`, `facebook_id`, `instagram`, `twitter` (campos del esquema abierto).
- **Acceso**: el acceso actual es por el **Foursquare Places Portal** (registro, token de acceso, catálogo Iceberg); reemplaza al cubo S3 público; Hugging Face y Snowflake aparecen como ofertas adicionales (requisitos NO VERIFICADOS). Licencia Apache 2.0 (copyright Foursquare Labs); cadencia de actualización **NO VERIFICADA**.
- **Veredicto: NO INTEGRAR directo.** Razones: acceso con cuenta + Iceberg (herramientas que no tenemos y que exigirían dependencias pesadas), y los mismos lugares ya están en Overture con atribución Apache 2.0. Se reevalúa solo si Overture resulta insuficiente.
- Fuentes: https://docs.foursquare.com/data-products/docs/access-fsq-os-places · https://docs.foursquare.com/data-products/docs/places-os-data-schema (2026-11-26).

### 5. Yelp Fusion

- **Datos**: nombre, dirección, **teléfono**, categorías, coordenadas, reseñas; **no devuelve el sitio web del negocio** (solo la URL de su página en Yelp).
- **Capa gratuita/términos**: ofrece «prueba gratuita» (duración y límites **NO VERIFICADOS**: la página enlaza a precios). Guía del desarrollador: se pueden **cachear datos hasta 24 horas** y guardar IDs de negocio solo para emparejamiento interno; exigen revisión de la integración y mostrar marca/enlace (resumen de terceros, **términos completos NO VERIFICADOS**: la URL de términos devolvió 404).
- **Veredicto: NO INTEGRAR.** No permite construir un directorio propio (caché de 24 h) y la prueba es temporal. Como mucho «consulta puntual no almacenable»: no se implementa.
- Fuentes: https://docs.developer.yelp.com/docs/fusion-intro · https://yelp-developers.readme.io/docs/fusion-faq (2026-11-26).

### 6. Mapbox Search

- **Datos**: Geocoding v6 ya no trae POI; los POI con `phone`/`website` («si aplica») están en Search Box API.
- **Términos**: «todos los datos de Search Box son solo de **uso temporal**»; para almacenar hay que contactar a ventas; en Geocoding el resultado `temporary` **no se puede cachear** y el `permanent=true` exige tarjeta de crédito o contrato; los resultados solo pueden usarse con un mapa Mapbox. No documentan capa gratuita en esas páginas (**NO VERIFICADO**: los precios están en otra página).
- **Veredicto: NO INTEGRAR** («consulta puntual no almacenable», sin implementar).
- Fuentes: https://docs.mapbox.com/api/search/geocoding/ · https://docs.mapbox.com/api/search/search-box/ (2026-11-26).

### 7. Sección Amarilla (y directorios similares)

- `robots.txt` (2026-11-26): `User-agent: * / Allow: /`, solo bloquea una página de confidencialidad; no hay prohibición técnica.
- Términos y condiciones: la página revisada **no menciona** extracción automatizada ni reutilización de su base; su única cláusula cercana es de confidencialidad contractual; los términos generales del sitio **no se pudieron confirmar**.
- Regla aplicada: «solo integrar si lo permiten de forma explícita». No hay permiso explícito de almacenar y reutilizar un listado de anunciantes (base de datos protegida), y la ausencia de prohibición no es permiso.
- **Veredicto: NO INTEGRAR.** Si algún día lo autorizan por escrito, se reevalúa.
- Fuentes: https://www.seccionamarilla.com.mx/robots.txt · https://www.seccionamarilla.com.mx/terminos-y-condiciones (2026-11-26).

### 8. Facebook / Instagram

- Condiciones de Meta, sec. 3.2.3: «No puedes acceder a datos desde nuestros Productos ni recopilarlos usando medios automatizados» sin permiso previo (aplica aunque haya sesión iniciada); también prohíbe vender/licenciar datos obtenidos. La API oficial de Graph no ofrece búsqueda de negocios de terceros para prospección. Además contradice la regla previa «sin redes sociales».
- **Alternativa permitida y adoptada**: si el **sitio oficial de la empresa** enlaza su página de Facebook/Instagram, el Rastreador puede registrarla como dato de contacto **citado** (`fuente_url` = la página del sitio oficial, no la red social), sin abrirla ni extraer nada de ella. Esto ya cabe en `crm_add_contacto` (tipo persona/teléfono/correo con fuente); no se agrega código nuevo. Tampoco se usan los campos `facebook_id`/`instagram` de FSQ/Overture como fuente: se ignoran al normalizar.
- **Veredicto: NO INTEGRAR.**
- Fuente: https://www.facebook.com/terms/ (2026-11-26).

## Decisiones de arquitectura derivadas

1. Adaptadores con interfaz común: `denue_local` (dataset), `denue_api` (API con token), `osm_overpass` (API), `overture_local` (dataset). Los descartados quedan en el registro como `estado: descartada` con el motivo, solo informativos y no ejecutables.
2. Datasets locales en SQLite (`dataset_registros`), filtrados a CDMX/Edomex y sin gobierno, con versión/fecha; las consultas locales no gastan cuota ni tokens.
3. Atribución por registro (`empresa_fuentes.atribucion/licencia`) y visible en la UI.
4. El tamaño (estrato DENUE) alimenta un filtro previo configurable (`tamano_min_personal`, por defecto 11) para no gastar IA en micronegocios.
5. Google Places pasa a complemento: el descubrimiento por código corre primero.

## No verificado (pendiente de confirmar por el dueño o en prueba LIVE)

- Gratuidad exacta, plazo y límites del token DENUE (se confirma al registrarse; el CRM aplica un tope propio).
- Nombre y estructura exactos de los CSV de la descarga masiva (el importador acepta alias de columnas y se probó con muestras sintéticas).
- Cobertura real de teléfono/correo/sitio en OSM y Overture para la zona piloto.
- Términos completos de Yelp y de Sección Amarilla, y precios/capas de Mapbox y Yelp.
