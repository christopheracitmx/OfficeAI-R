/**
 * Envía UN correo de muestra con la plantilla actual a la dirección indicada (uso manual, no pasa
 * por el CRM ni por la lista de destinatarios). Uso: npx tsx scripts/probar-correo.ts correo@dominio
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resend } from 'resend';
import { armarReporte } from '../src/server/services/mailer';
import { adjuntosLogo, remitenteConNombre } from '../src/server/services/email-plantilla';

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'));
const destino = process.argv[2];
if (!destino) throw new Error('Indica el correo de destino');

const md = `**Oye jefe, encontré a GS1 México.**

## 1. Resumen
- **Empresa:** GS1 México (Asociación Mexicana de Estándares para el Comercio Electrónico, A.C.), asociación civil privada, no gobierno.
- **Giro:** estándares y códigos de barras.
- **Ubicación:** Blvd. Toluca 46, Col. El Conde, Naucalpan de Juárez, Edomex.
- **Sitio:** https://www.gs1mexico.org (no verificado; hubo timeout al leerlo).
- **Score:** 62, nivel B.

## 2. Por qué es buen prospecto
- Evidencia: fuentes reportan nuevas oficinas, un centro de conocimiento para PyMEs y una Smart Shop en sus instalaciones.
- Organización mediana, con operación de registro de códigos y bases de datos de productos (inferencia sobre su infraestructura).
- Está en Edomex, dentro del piloto.
- Ojo: el tamaño es estimado, no hay cifra de empleados.

## 3. Paquetes sugeridos
- **Oficinas nuevas:** ThinkPad, ThinkVision, switches Aruba, puntos de acceso Aruba y Aruba Central. Es para equipar y conectar las instalaciones nuevas (la necesidad de equipo es inferencia).
- **Centro de conocimiento y Smart Shop:** ThinkCentre Tiny, ThinkVision y Wi-Fi Aruba para demostraciones y visitantes.
- **Infraestructura de datos:** ThinkSystem y switches Aruba (inferencia; hay que validar la infraestructura actual).

## 4. Contacto
- Correo: info@gs1mexico.org (fuente: https://gs1.org/locations/mexico).
- Teléfono: 55 5249 5200 (misma fuente).
- No hay responsable identificado.

## 5. Cercanía
Naucalpan está en Edomex, en la zona de influencia de las oficinas de Estado de México y CDMX.

## 6. Notas y riesgos
- Sitio sin verificar y contacto solo genérico.
- Las necesidades de laptops, red y servidores son inferencias.
- Falta confirmar el responsable de TI y el estado real de las obras o instalaciones nuevas.`;

const m = armarReporte({
  empresa: 'GS1 México',
  nivel: 'B',
  score: 62,
  reporte_md: md,
  url: 'http://127.0.0.1:4010/prospectos/1',
});
writeFileSync(resolve(process.env['TEMP'] ?? '.', 'correo-muestra.html'), m.html);
const key = process.env['RESEND_API_KEY'];
if (!key) throw new Error('Falta RESEND_API_KEY en .env');
const from = remitenteConNombre(process.env['RESEND_FROM']?.trim() || 'onboarding@resend.dev');
const { data, error } = await new Resend(key).emails.send({
  from,
  to: [destino],
  subject: `[PRUEBA DE DISEÑO] ${m.asunto}`,
  text: m.texto,
  html: m.html,
  attachments: adjuntosLogo(),
});
console.info(
  error ? `ERROR: ${error.message}` : `Enviado a ${destino} (id ${data?.id}) desde ${from}`,
);
