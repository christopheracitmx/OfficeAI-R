# Conectar Gemini y OpenCode Go (manual)

Claude sigue siendo el motor por defecto (usa tu sesion de Claude Code, sin llave). Gemini y OpenCode Go son opcionales y se eligen **a mano**; no hay cambio automatico si uno se agota.

## 1. Llaves en `crm\.env`

```
GEMINI_API_KEY=tu_llave_de_google
OPENCODE_API_KEY=tu_llave_de_opencode
```

- **Gemini:** crea la llave en <https://aistudio.google.com/apikey> (capa gratuita: limites por minuto y por dia; sirve para pruebas, no para lotes grandes).
- **OpenCode Go:** crea la llave en tu cuenta de <https://opencode.ai/console> (plan Go de $10/mes: una bolsa de uso compartida por todos sus modelos; limites por 5 horas y semanales).
- Nunca pegues una llave en un chat, en git ni en un documento.
- Reinicia el CRM despues de editar `.env`.

## 2. En la app

**Configuracion -> Motor de IA**: cada proveedor dice si esta conectado; con llave, lista **los modelos que tu llave puede usar hoy** (se consultan en vivo a la API). Por modelo puedes:
- **Probar**: una prueba corta (responde y sabe usar herramientas; sin esto no sirve para los agentes).
- **Usar**: lo deja como motor de las corridas.
- Anotar su **Calidad %** (tu nota tras tus pruebas; Claude Sonnet es la referencia).

En **Corrida** aparece el mismo selector arriba del boton Iniciar. No se puede cambiar con una corrida en curso.

## 3. Limitaciones conocidas

- Claude usa solo Sonnet 5.5.
- Gemini y OpenCode Go no tienen busqueda web nativa: los agentes leen paginas con `obscura_extract` (el Explorador puede rendir menos).
- OpenCode Go se llama por el formato chat/completions; si algun modelo no lo soporta, la prueba lo dira.
- Los datos del prospecto (nombre, contactos, sitio) salen a Google/OpenCode al usarlos.
- Gemini en capa gratuita puede devolver limite (429): la corrida se pausa, no cambia sola de proveedor.
