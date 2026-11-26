# ACITMX Prospecting Office — guía de puesta en marcha

La oficina de agentes ya vive DENTRO del CRM (runner propio). No se usa Munder Difflin.

## 1. Una sola vez
1. Verifica que Claude Code esté instalado y con sesión de tu suscripción: en una terminal, `claude auth status` debe decir `loggedIn: true` y `authMethod: claude.ai`. (Si no, ejecuta `claude` y entra con tu cuenta.)
2. Doble clic en `iniciar-crm.bat`. Crea `crm\.env`; llénalo:
   - `RESEND_API_KEY` (dominio mail.acitmx.net verificado en Resend; remitente info@mail.acitmx.net)
   - `GOOGLE_PLACES_API_KEY` (opcional: en Google Cloud pon cuota diaria baja + alerta de presupuesto; el CRM ya limita a 4,900/mes). Sin llave, los agentes descubren empresas solo con búsqueda web.
3. En el CRM → Configuración → «Correos de reportes»: confirma tu correo y pulsa **Enviar prueba**.

## 2. Cada vez que quieras prospectar
1. `iniciar-crm.bat` (deja la ventana abierta; ahí corren los agentes).
2. CRM → **Corrida**: zona, giro y máximo (10 por defecto; empieza con 3) → **Iniciar corrida**.
3. Mira el progreso en la misma pantalla y a los agentes en **Ver oficina** / **Actividad**. Puedes **Detener** cuando quieras (se cancelan los procesos de IA al instante).
4. Los prospectos que pasan QA llegan a **Prospectos** y te avisan por correo.
5. Tú decides: canalizar a un vendedor (campo «Canalizado a») o descartar.

Nada corre solo: sin pulsar «Iniciar corrida» los agentes no hacen nada. Solo hay una corrida a la vez.

## 3. Tu «cerebro» de la oficina (menú lateral)
- **Biblioteca**: lo que los agentes saben de ACITMX (productos por marca y familia, giros objetivo, oficinas, voz y tono, reglas, objeciones). Ya viene sembrada. Edítala con vista previa Markdown, historial y «Restaurar». Importa productos por CSV. **Nunca acepta precios**: si escribes un monto, lo rechaza. Los documentos archivados dejan de verse para los agentes.
- **Prompts**: instrucciones de cada agente y el bloque global. Cada guardado crea una versión; compara cambios (diff) y restaura la que quieras. «Prompt final compuesto» muestra exactamente lo que recibe cada paso y cuántos tokens pesa. Los candados de seguridad no se pueden editar aquí.
- **Habilidades**: procedimientos en texto (p. ej. «Verificar que un sitio es el oficial») que se añaden al prompt de los agentes que elijas. Actívalas o desactívalas; son solo instrucciones.
- **Salidas**: qué entregó cada agente en cada paso, cuántos tokens consumió y cuánto tardó (tabla de consumo por agente arriba).
- Un cambio de prompt, habilidad o Biblioteca aplica desde la **siguiente llamada** de un agente (no hace falta reiniciar).
- Si el CRM ya tenía datos de antes, al abrirlo se crean solas las tablas nuevas y se siembran la Biblioteca, los prompts y las habilidades (una sola vez).

## 3b. Ver oficina (3D)
- La oficina se ve SIEMPRE en 3D: 12 agentes (6 mujeres y 6 hombres) en recepción, Dirección, Descubrimiento, Investigación, Estrategia, Calidad, Reporte, Biblioteca, Aprendizaje y Cafetería. Se mueve sola con los eventos reales de la corrida: teclean con el monitor encendido, llevan el expediente (folder amarillo; rojo si es una devolución de QA) al siguiente puesto y levantan las manos con un aviso rojo cuando QA devuelve algo. Sin corrida: «Oficina en pausa».
- **Arrastra** para mover, **rueda** para acercar (de cerca aparecen todos los nombres), botones **⟲/⟳ 90°** para girar. **Clic en un agente** (o en su nombre en la lista de abajo): panel con Estado, Salidas, Prompt (el mismo editor de «Prompts»), Habilidades, Historial y Aprendizaje (próximamente). **Clic en la Biblioteca** abre la Biblioteca.
- **Calidad**: Alta (sombras, brillo en pantallas, polvo), Media, Baja (bajo consumo: sin sombras ni efectos). **Iluminación**: Día, Noche o según la hora. La preferencia se recuerda en este navegador.
- **Pantalla completa**: botón «Pantalla completa (F)» sobre el lienzo (o la tecla **F**). Expande la oficina a toda la pantalla con controles mínimos (girar, calidad, salir); un clic en un agente abre su panel a la derecha. **Esc** sale. Funciona también dentro del modo presentación (primer Esc: sale de pantalla completa; segundo Esc: sale de la presentación).
- **Vista por área**: junto a «Piso» elige un área (Investigación, Calidad...) y la cámara se acerca para ver a los agentes; «General» vuelve a la vista completa. Los nombres de los agentes ya se ven siempre y los rótulos de sala no crecen al acercar. Las burbujas dicen qué se hizo y a quién pasa el expediente («Ficha de la empresa lista → Estratega»). Las dos paredes del fondo tienen ventanas y cambian al girar la vista.
- **Modo presentación**: pantalla completa sin datos sensibles (las burbujas no muestran correos, teléfonos ni empresas). Esc para salir.
- Si tu sistema pide «reducir movimiento», la escena no anima (solo cambia de estado) y la cámara salta sin transiciones.
- Si el navegador no tiene WebGL verás un aviso y la lista textual de agentes (no hay versión 2D).

## 3c. Probar la oficina 3D sin gastar nada (técnico)
En `crm\` (con `tools\node22` en el PATH): `npm run build` y luego `npx tsx test/p7-demo-servidor.ts C:\ruta\temporal\demo.db` → abre http://127.0.0.1:4099/oficina (la demo usa 4099, NUNCA 4010; se cierra con Ctrl+C). Usa una BD temporal y eventos simulados (sin Claude, sin Places, sin correos). Prueba de humo con captura real: `node test/p7-humo-3d.mjs http://127.0.0.1:4099/oficina humo.png` (usa Edge del sistema vía `tools\pw-shot`).

## 3d. Cuidar tu plan de Claude (medidor, reserva y estimador)
- **Medidor**: en la barra lateral y en **Corrida** aparece el % usado de tu ventana de 5 horas y de la semanal, a qué hora se reinician y cuándo se actualizó el dato. Lo informa el propio Claude Code en cada llamada de un agente (no hay forma de consultarlo sin ejecutar algo), así que al abrir el CRM dirá «sin datos» hasta la primera corrida. Cuenta TODO el uso de tu suscripción (también tus otras conversaciones de Claude).
- **Reserva** (Configuración → **Plan y reserva**): por defecto la corrida se **pausa al llegar al 70 %** de la ventana de 5 h (90 % la semanal). Queda como «Pausada: reserva del plan» y la reanudas con **Reanudar de todos modos** cuando quieras (no volverá a pausar por reserva en esa reanudación). Se pausa entre pasos, nunca a la mitad de uno.
- **Si Claude no informara porcentaje**, puedes escribir un **presupuesto de 5 horas en tokens**: la app muestra una barra rotulada «ESTIMADO» (solo suma lo que gastó esta app, no tu otro uso) y la reserva usa ese estimado. Sin presupuesto y sin datos, no inventa cifras.
- **Estimador por corrida**: en **Corrida**, antes de iniciar, ves el consumo estimado (empresas × promedio de tus últimas corridas; sin historial, 95,000 por empresa). Si pasa del umbral (600,000 por defecto, editable) te pide confirmación.
- **Modelo por paso** (ahorro): `modelo:` en `engine.yaml` es el general; cada paso puede tener su propio `"modelo"` en `workflow.json` (valores: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`; Fable exige créditos y no funciona en Pro). Hoy TODOS usan Sonnet: Haiku se probó y no se aprobó en ningún paso (ver el archivo consumo-tokens.md en docs, carpeta dungeons, 04-execution). Prompts → «Prompt final compuesto» muestra el modelo de cada paso.

## 3e. Tus datos y su protección
- **¿Estoy viendo mis datos reales?** Configuración → «Cuotas y motor» muestra «Base de datos: ruta» y el modo (real o DEMOSTRACIÓN). Si el servidor es una demo, la barra lateral muestra un aviso naranja «BASE DE DEMOSTRACIÓN». Tus datos reales viven en `crm\data\crm.db` (la ruta se resuelve desde la carpeta `crm`, no desde donde abras la terminal).
- Si el puerto 4010 ya lo usa otro programa, `iniciar-crm.bat` y el servidor se detienen con «Puerto 4010 ocupado: otro proceso lo usa» (y NO abren el navegador). Cierra ese programa y vuelve a abrir. Esto ocurrió una vez: una demo de pruebas olvidada ocupaba el 4010 y el navegador mostraba su base vacía, no la tuya.
- Antes de aplicar cualquier migración pendiente se hace un respaldo automático en `crm\data\backups\crm-pre-<migración>-<fecha>.db` (se conservan los últimos 5). Cada migración corre en una transacción y verifica las llaves foráneas; si falla se revierte y el mensaje indica el respaldo.
- Al cerrar el servidor con Ctrl+C se vuelca y cierra la base limpiamente. Las pruebas y la demo nunca usan `crm.db` ni el puerto 4010.
- `data/runner/` y `data/runner-test/` (archivos generados) ya no se versionan en git.

## 4. Si algo se pausa
- **Pausada: reserva del plan** — llegaste a tu reserva (ver 3d). Reanuda cuando quieras o espera a que se reinicie la ventana.
- **Pausada: límite del plan de IA** — llegaste al límite de tu suscripción. Espera a que se libere (la pantalla muestra la hora si Claude la informa) o cambia `engine` en `crm\config\engine.yaml` y reinicia el CRM. Luego pulsa **Reanudar** en el historial: sigue donde se quedó.
- **Pausada: cuota de Places** — se alcanzó el tope mensual; se procesó lo ya descubierto.
- **Error** (circuit breaker: pasos fallidos seguidos, tiempo máximo) — revisa «Actividad»; **Reanudar** reintenta.
- Si cierras el CRM a media corrida, al volver a abrirlo queda marcada con error y puedes reanudarla.

## 5. Ajustes (`crm\config\engine.yaml`)
- `modelo` (hoy `claude-sonnet-5-5`) y `esfuerzo` (`low` = menos consumo del plan; sube a `medium` si la calidad no te convence).
- `prompt_modo: reemplazar` hace que el prompt de la oficina sustituya al del CLI (ahorra ~2.6 k tokens por llamada); `agregar` lo suma.
- `agrupar_pasos: true` junta pasos baratos en una sola llamada (ahorra plan). Pon `false` para separar todos los roles.
- `capacidades_off: places` apaga Places aunque haya llave.
- `timeout_paso_min`, `max_minutos_corrida`, `max_fallos_seguidos`: topes de seguridad.
- Los prompts de cada agente se editan en la pantalla **Prompts**; los archivos `crm\config\offices\prospeccion\agents\*.md` son solo la semilla inicial (cambiarlos después no afecta). El flujo está en `workflow.json` de esa carpeta. Los candados de seguridad (no contactar prospectos, sin precios, solo correos internos) están en código y no se editan ahí.

## Seguridad (ya aplicada en código)
- Los agentes nunca contactan prospectos ni mencionan precios; solo se envían alertas a los correos de Configuración, y las envía el servidor.
- Cada agente solo tiene las herramientas que necesita; no tiene acceso a archivos ni a la terminal.
- El servidor escucha solo en 127.0.0.1; las acciones del dueño exigen el origen de la interfaz.
- Tope duro de Places 4,900/mes; solo CDMX y Estado de México; sin gobierno; lista «No contactar».

## 3f. Aprendizaje de los agentes (nada cambia solo)
- En cada prospecto da 👍/👎 por etapa (contactos, ficha, paquetes, reporte), con etiqueta y nota. QA y tus resultados también quedan como retroalimentación.
- **Aprendizaje** (barra lateral): bandeja de propuestas (aprobar/editar/descartar/archivar), lecciones activas por agente, historial, Desempeño y Casos dorados. Solo lo que apruebas llega a los prompts (máx. 10 por agente).
- **Reflexión** es un botón: muestra el consumo estimado y pide confirmación; respeta la reserva del plan. Nunca corre sola.
- **Casos dorados > Evaluar** mide un cambio de prompt contra casos de prueba (gasta plan, pide confirmación).
- **Configuración > Respaldos**: crear respaldo y restaurar (escribe RESTAURAR; antes se respalda el estado actual). **Registro de cambios** y **Exportar CSV** (Prospectos).

## 3g. Edificio con varios pisos

- **Edificio** (barra lateral): una tarjeta por piso (oficina) con estado, agentes, última corrida, lecciones pendientes y % de uso del plan. Desde ahí creas un piso nuevo (plantilla vacía o duplicando otro), renombras, subes/bajas de piso y archivas. Nada se borra: lo archivado se restaura cuando quieras.
- **Selector de piso** (barra lateral y «Ver oficina»): fija la oficina activa de TODA la app (Biblioteca, Prompts, Habilidades, Salidas, Aprendizaje, Corrida y Actividad muestran solo ese piso). Prospectos, Embudo y Directorio existen únicamente en el piso de Prospección.
- **Ver edificio en 3D** («Ver oficina» → «Ver edificio»): fachada con los pisos; la luz de cada piso se enciende cuando trabaja. Clic en un piso para entrar. Av Pág / Re Pág cambian de piso dentro de la oficina.
- **La IA atiende de una llamada a la vez en todo el edificio**: si dos pisos corren a la vez, esperan turno (cuida tu plan; el medidor y la reserva son globales).
- **Flujo (avanzado)** en la tarjeta de un piso creado por ti: el flujo como JSON validado. Los pisos nuevos solo pueden usar Biblioteca, lectura web y aviso interno. Al duplicar Prospección el flujo copiado usa herramientas del CRM y no se podrá iniciar hasta editarlo (el Constructor de oficinas, futuro, lo hará guiado).
- Tu base se migra sola al abrir el CRM (hay respaldo automático previo en `crm\data\backups`); tus prospectos quedan en el piso de Prospección.

## 3h. Personalizar (apariencia de personajes, salas y oficina)

En la barra lateral, **Personalizar** (también desde "Ver oficina" y el panel de cada agente). Tres pestañas: Personajes, Salas y Oficina. Cada cambio se ve al instante en la vista previa 3D y se guarda solo; hay Deshacer/Rehacer, Versiones, Comparar con default, Aleatorio, Guardar como preset, Importar y Exportar. Los presets de equipo (uniforme, casual, formal, aleatorio 50/50) están arriba en Personajes.

Para ver esta función en tu CRM real: **cierra y vuelve a abrir el CRM** (iniciar-crm.bat). Al arrancar aplica la migración 007 conservando tus datos (hace un respaldo automático antes). El editor de salas usa tamaño y posición numéricos; arrastrar y soltar queda como mejora.


## 3i. Datos, herramientas del piso y paquetes (P10a)

Para ver todo esto en tu CRM real: **cierra y vuelve a abrir el CRM** (`iniciar-crm.bat`). Al arrancar se aplica la migración 008 conservando tus datos (hace un respaldo automático antes en `crm\data\backups`).

- **Datos** (barra lateral): las tablas del piso activo. «Nueva colección» te deja definir campos (texto, número, fecha, sí/no, enlace, lista de opciones) y un **campo clave** que evita duplicados. Cada registro guarda su **fuente** (enlace o nota) y su historial; nada se borra, solo se **archiva** (y se puede restaurar). «Exportar CSV» baja la tabla (protegida contra fórmulas de Excel). Los agentes escriben con `coleccion_upsert`, que valida el esquema, evita duplicados y exige la fuente.
- **Configuración → Herramientas del piso** (solo en pisos nuevos; Prospección conserva sus herramientas):
  - Marca qué herramientas puede usar cada piso. Se aplica **en código**: un agente no puede usar una herramienta no marcada aunque su prompt la pida.
  - **Archivos**: apagado por defecto. Autoriza carpetas (ruta absoluta, por ejemplo `C:\Documentos\Facturas`) y actívalo. Los agentes solo pueden listar y leer texto dentro de esas carpetas; «mover» manda el archivo a `_cuarentena` dentro de la misma carpeta, **nunca borra**, y puedes **Revertir** desde el registro.
  - **Correo de avisos**: apagado por defecto. Con él, `notificar_interno` además de la Actividad manda un correo **solo** a los destinatarios internos activos (pestaña «Correos de reportes»), máximo 10 por hora.
  - **Candados**: los de seguridad (sin contacto externo, sin borrado, solo internos) son fijos. Solo puedes relajar los **topes de consumo**, con una confirmación explícita; queda en el Registro de cambios.
- **Edificio → Galería e importar**: 4 plantillas base (Vacía, Base de datos, Archivos/CRM, Noticias del sector) y la importación de un paquete `.json`. Antes de crear ves un resumen de qué se creará; el paquete **nunca** trae datos operativos ni secretos. En cada tarjeta de piso, **Exportar paquete** baja ese piso como `.json` (el piso de Prospección no se exporta porque usa herramientas propias: se duplica).

## 3j. Cómo crear un piso nuevo (Constructor «Nuevo piso», P10b)

En **Edificio → Nuevo piso** (el botón «Piso vacío» sigue creando uno mínimo). Tienes tres formas de empezar:

1. **Con asistente (IA)**: conversas con la «Arquitecta de oficinas». Cada mensaje tuyo es **una** llamada de IA (Sonnet, esfuerzo bajo) y gasta unos 4,000-6,000 tokens de tu plan (se muestra el estimado en pantalla). La IA recibe solo el resumen de lo ya decidido, no toda la conversación. Si tu reserva del plan está alcanzada, o no hay motor, el asistente se **pausa y te avisa**; puedes seguir con el formulario.
2. **Formulario guiado (sin IA)**: las mismas fases llenando campos; no gasta plan.
3. **Desde una plantilla** de la galería.

Las 9 fases (el menú de la izquierda te deja saltar entre ellas; cada fase tiene su formulario aunque uses la IA, para corregir a mano):

1. Objetivo y entregable · 2. Datos de entrada/salida y dónde se guardan · 3. Agentes (rol, área, género «Auto» = reparto 50/50, QA) y rondas de devolución · 4. Herramientas del catálogo (lo que no esté queda marcado «requiere herramienta nueva» con su especificación) · 5. Biblioteca inicial (pega texto) · 6. Candados y reglas extra · 7. **Vista previa 3D** del piso propuesto · 8. **Prueba controlada** (opcional, una llamada de IA sin efectos; muestra el consumo y pide confirmación) · 9. **Crear el piso**.

Nada se crea hasta que marques «Apruebo este borrador». «Edición avanzada» muestra el borrador como JSON validado campo por campo. Al crear: el piso aparece en el Edificio con sus agentes, Biblioteca inicial, colecciones y prompts; ahí los editas en las pantallas de siempre (Prompts, Biblioteca, Personalizar, Flujo avanzado). El prompt de la Arquitecta es editable (`/api/constructor/prompt`); los candados fijos siempre se añaden en código.

Para correr el piso nuevo: selecciónalo en el selector de piso, ve a **Corrida** y escribe la tarea; verás el estimado de consumo antes de confirmar.
