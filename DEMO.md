# Guion de la demo de Handle (5–7 minutos, en local)

Historia: **Doña Lupita** tiene unos abarrotes en Santa María la Ribera (CDMX). Con Handle cobra con
CoDi (sin terminal ni comisiones de tarjeta), premia a sus clientas con puntos y aparece en un mapa
de changarros de su colonia. Se muestran cuatro personas: la dueña, su cajero, una clienta y la red
Handle.

Todo corre en tu computadora con el **simulador de pagos** (`PAYMENTS_PROVIDER=mock`): ningún cobro
mueve dinero real. La base de datos sí es la compartida de Supabase; los datos de la demo están
marcados sin que se note en pantalla (todos sus miembros tienen correo `@demo.handle-prueba.mx` y
sus usuarios llevan `demo_handle` en los metadatos) y se borran con un comando.

## Cuentas

| Botón en `/demo` | Persona | Correo | Entra a |
|---|---|---|---|
| Entrar como dueña | Lupita Hernández, Abarrotes Doña Lupita | `lupita@demo.handle-prueba.mx` | `/dashboard` |
| Entrar como cajero | Beto Ramírez, cajero de Doña Lupita | `beto.cajero@demo.handle-prueba.mx` | `/caja` |
| Entrar como cliente | Mariana López, clienta VIP | `mariana@demo.handle-prueba.mx` | `/monedero` |
| Entrar como red | Equipo Red Handle (`admin_red`) | `red@demo.handle-prueba.mx` | `/red` |

Otros datos que ya están: 12 changarros aprobados en el mapa (3 recomendados: Doña Lupita, Tacos El
Güero y Panadería La Espiga), 2 changarros con expediente **en revisión** (Cremería La Vaquita y
Pollería El Gallo de Oro, con sus 4 documentos de ejemplo) para la escena opcional de la red, ~30
días de cobros pagados, clientes con niveles distintos (Mariana VIP, Jorge "confianza", Sofía
"nuevo") y vecinos frecuentes sin cuenta. Cada changarro tiene su propia cuenta de dueño
(`dueno.<negocio>@demo.handle-prueba.mx`); no se usan en el guion.

## Preparación (una vez, ~2 minutos)

```bash
npx bun install
npx bun run demo:datos      # crea o completa los datos de demo (se puede correr varias veces)
```

- `.env` en la raíz con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, las `VITE_SUPABASE_*` y
  `PAYMENTS_PROVIDER=mock`. Para poder **borrar** la demo después también `SUPABASE_ACCESS_TOKEN` y
  `SUPABASE_PROJECT_ID`.
- Al terminar imprime una tabla: deben salir 15 organizaciones, 14 negocios (2 en revisión con 8
  documentos), 12 en el mapa, 3 recomendados y ~269 cobros pagados. Para revisarla sin cambiar nada: `node --env-file=.env scripts/demo-datos.mjs --conteos`.

## Checklist antes de presentar (10 minutos antes)

- [ ] `PAYMENTS_PROVIDER=mock` en `.env` (nunca `pey` en una demo).
- [ ] Datos frescos: `npx bun run demo:limpiar && npx bun run demo:datos` (deja todo como nuevo:
      regla de puntos al 5 %, pines y recomendados originales, cobros de hoy en el dashboard).
- [ ] Levantar la app para la demo: `npx bun run demo` (enciende `DEMO_MODE`, escucha en la red local
      e imprime la URL y un QR). Sin wifi compartido: `npx bun run demo -- --tunel`.
- [ ] En la compu abrir `/demo` y comprobar que salen los 4 botones (si dice "La demo no está
      disponible", ver Plan B).
- [ ] Escanear el QR con el celular, abrir `/demo` ahí también y entrar como **cliente** para que
      quede lista (Mariana).
- [ ] Pestañas abiertas en la compu: `/demo` (dueña) y `/mapa`. Zoom del navegador al 110–125 % si
      se proyecta.
- [ ] Celular con brillo alto, sin notificaciones (modo no molestar).
- [ ] Ensayo rápido de la escena 2 (cobro) — es la que más impresiona y la que más depende de la red.

## Guion (con tiempos)

### 0. Gancho (0:00–0:30)

**Pantalla:** `/mapa` en la compu.

> "Esta es Santa María la Ribera. Cada punto es un changarro que ya cobra con CoDi y premia a sus
> clientes con Handle. Las estrellas son los que la red recomienda."

Señala los filtros por categoría (Abarrotes, Taquería, Panadería…) y el botón **Recomendados**.

### 1. La dueña configura sus puntos (0:30–1:45)

**Acción:** `/demo` → **Entrar como dueña**.

1. Llega al **Dashboard**: ventas CoDi de hoy, cobros y ticket promedio, quién cobró (Lupita y Beto).
   > "Lupita ve en un vistazo cuánto vendió hoy con CoDi, sin cuadrar la caja a mano."
2. Menú **Mi negocio** → tarjeta **Programa de puntos**. Hoy da 5 %.
3. Cambia **Puntos por cada $100 (%)** a `10` y deja **Máximo a pagar con puntos (%)** en `50`.
   Muestra la vista previa (cuántos puntos gana un cliente con una compra) → **Guardar cambios**.
   > "Ella decide cuánto regresa. Los puntos son descuento en su tienda, no dinero: no se retiran ni
   > se transfieren."

### 2. El cajero cobra con CoDi y la clienta usa puntos (1:45–3:30)

**Acción:** en la compu, `/demo` → **Entrar como cajero** (Beto llega directo a la **Caja**, pensada
para celular).

1. **¿Cuánto vas a cobrar?** → `250`. Forma de cobro: **Código QR**.
2. **Correo del cliente** → `mariana@demo.handle-prueba.mx` → **Buscar**. Sale *Mariana López*, su
   nivel y **Saldo aquí: ~150 puntos**.
   > "Beto no necesita tarjeta de lealtad ni app extra: con el correo la encuentra."
3. **Usar puntos** → `50`. Se ve el descuento (−$50.00) y **A cobrar $200.00**. → **Cobrar $200.00**.
4. Aparece el **QR de CoDi** (y cuántos puntos ganará: con 10 % y nivel VIP ×1.5 son 30).
   > "Mariana lo escanea con la app de su banco y paga directo a la cuenta de Lupita, sin comisión
   > de terminal."
5. **Simular pago del cliente** → **¡Pagado!** y **Ganó 30 puntos**.
   > "En esta demo el pago es simulado; en producción lo confirma CoDi en segundos y la pantalla
   > cambia sola."

### 3. La clienta ve su monedero (3:30–4:30)

**Acción:** el celular (ya en `/monedero` como Mariana). Si estaba abierto, recargar.

1. **Mis puntos**: nivel **VIP** y su beneficio.
2. Saldo por negocio: Abarrotes Doña Lupita (subió con la compra de hace un momento), Tacos El Güero,
   Panadería La Espiga. Fecha en que vencen.
3. Historial: **Usaste −50** y **Ganaste +30** de la escena anterior.
   > "Mariana ve sus puntos en todos los changarros de la red, desde su celular, sin descargar nada."

### 4. Mapa público y perfil (4:30–5:15)

**Acción:** `/mapa` (en el celular o la compu; no requiere cuenta).

1. Filtro **Abarrotes** → en la lista, **Ver** junto a **Abarrotes Doña Lupita** (o toca su estrella en el mapa → **Ver perfil del negocio**).
2. Perfil: dirección, horario (lunes a sábado 7:30 a 21:30, domingo 9:00 a 15:00), la promoción
   "Gana 10 puntos por cada $100 que pagues" (lo que Lupita configuró en la escena 1) y cómo pagar.
   > "Cualquiera en la colonia encuentra el changarro, ve su horario y sabe que ahí junta puntos."

### 5. La red recomienda y corrige el pin (5:15–6:30)

**Acción:** compu, `/demo` → **Entrar como red**.

1. **Red Handle** → pestaña **Aprobados** (los 12 de la colonia; puede haber alguno más de pruebas).
   Los negocios inactivos se ocultan; el interruptor **Mostrar negocios inactivos** los enseña.
   > "La red revisa el expediente de cada negocio (INE, constancia fiscal, comprobante de domicilio
   > y cuenta) antes de que pueda cobrar."
2. En la fila de **Frutería Doña Chela** → **Ver** → activa **Negocio recomendado**.
3. **Mover pin** → arrastra el pin a la esquina de enfrente (o toca el mapa donde va) → **Guardar ubicación**.
4. **Ver perfil público** → en `/mapa` ya sale con estrella y en su nuevo lugar.
   > "Así la red cuida la calidad del mapa: destaca a los buenos changarros y corrige ubicaciones."

### 5b. Opcional: la red aprueba un negocio nuevo (+1 min)

**Acción:** sigue como red. Úsala si sobra tiempo o preguntan cómo entra un changarro a Handle.

1. Pestaña **En revisión** → **Cremería La Vaquita** → **Revisar**.
2. Muestra los datos fiscales y abre un documento con **Ver** (son PDF de ejemplo, sin valor
   oficial).
   > "Antes de cobrar, la red revisa que los datos coincidan con la INE, la constancia del SAT, el
   > comprobante de domicilio y el estado de cuenta."
3. **Aprobar** → "Negocio aprobado y ubicado en el mapa". En `/mapa` ya sale la Cremería.
4. Si quieres mostrar un rechazo, usa **Pollería El Gallo de Oro**: escribe el motivo en **Notas
   para el negocio** → **Rechazar**.

Una aprobación no se deshace (la bitácora de revisiones es inmutable): para repetir la escena,
`npx bun run demo:limpiar && npx bun run demo:datos`.

### 6. Cierre (6:30–7:00)

> "Handle le da a la tiendita de la esquina lo que tienen las cadenas: cobro digital sin comisiones
> de tarjeta, un programa de lealtad propio y clientes nuevos que la encuentran en el mapa."

## Frases clave (por si te pierdes)

- "Cobro con CoDi: del banco del cliente a la cuenta del changarro, sin terminal."
- "Los puntos son descuento en el changarro donde se ganaron; no son dinero."
- "Cada rol ve solo lo suyo: el cajero cobra, la dueña administra, la clienta ve sus puntos."
- "La red aprueba a los negocios antes de que cobren y cuida el mapa."
- "Hoy es una demo con pagos simulados; la integración real con Pey ya está hecha."

## Plan B (si algo falla)

| Falla | Qué hacer |
|---|---|
| `/demo` dice "La demo no está disponible" | La app no corre con `bun run demo` (falta `DEMO_MODE=true`, no es `vite dev` o `PAYMENTS_PROVIDER` no es `mock`). Detén y vuelve a correr `npx bun run demo`. |
| Botón de `/demo` da error "no existe" | Faltan los datos: `npx bun run demo:datos` (~1 minuto) y reintenta. |
| El celular no abre la URL | Misma red wifi que la compu, o `npx bun run demo -- --tunel`. Último recurso: hacer la escena 3 en la compu con una ventana de incógnito y la vista de celular de las herramientas del navegador. |
| El buscador del cliente no la encuentra | Revisa el correo (`mariana@demo.handle-prueba.mx`). Plan C: cobrar sin cliente (el cobro sale igual, sin puntos) y mostrar el monedero ya existente. |
| "Simular pago" no cambia a ¡Pagado! | Recargar `/caja`: el cobro aparece en **Cobros de hoy**. Si venció (10 min), cobrar de nuevo. |
| El mapa no carga los mosaicos (sin internet) | Mostrar la lista de negocios de la derecha y el perfil; el mapa base viene de OpenStreetMap. |
| Los números no coinciden con el guion | Alguien ya ensayó sobre los mismos datos. Usar los que salgan, o restablecer con `npx bun run demo:limpiar && npx bun run demo:datos`. |
| Supabase caído o sin internet | Mostrar el video de la demo (T18–T20) o capturas. |

## Después de la demo

- Para dejar todo como nuevo: `npx bun run demo:limpiar && npx bun run demo:datos`.
- Para quitar la demo de la base compartida: `npx bun run demo:limpiar`. Retira los negocios del mapa
  y, con `SUPABASE_ACCESS_TOKEN`, borra en una sola transacción solo organizaciones con al menos un
  miembro y **todos** sus miembros `@demo.handle-prueba.mx` (y las de corridas viejas llamadas
  `Demo · …` sin miembros ajenos), clientes `@demo.handle-prueba.mx`, los documentos de esas
  organizaciones en el bucket `kyb` y sus usuarios de Auth. No toca datos E2E ni negocios reales.
- Si `demo:datos` dice que hay datos con la marca anterior (`Demo · …`), corre antes `demo:limpiar`.
- `DEMO_MODE` nunca va en producción: el código de `/demo` ni siquiera entra al build
  (`bun run verificar:bundle` lo revisa).
