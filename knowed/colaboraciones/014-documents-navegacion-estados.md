# 014 — Documents: navegación por niveles y estados vacíos

**Fecha:** 2026-06-11  
**Estado:** Completado

---

## Resumen

Refactor completo de la sección Documents para que cada nivel de la jerarquía (Empresa → Departamento → Carpeta → Documento) tenga un estado vacío limpio con acción directa centrada, y el topbar quede libre de controles que no corresponden al contexto.

---

## Cambios en Topbar

| Elemento | Antes | Después |
|----------|-------|---------|
| `+ New company` | Siempre visible en Documents | **Eliminado** — solo existe en el grid raíz |
| Selector de modelo LLM | Visible en todos los pages excepto chat | **Solo en Chat** — eliminado del topbar |
| Selector de empresa | Siempre visible en Documents | Solo cuando `companies.length > 0` |

---

## Jerarquía de navegación actualizada

```
Raíz (sin empresa)
  → Sin empresas       : empty state centrado + botón "New company"
  → Con empresas       : grid de tarjetas de empresa + card "Nueva empresa"

Empresa seleccionada (nav.view = 'all')
  → Sin departamentos  : empty state centrado + botón "New department"
  → Con departamentos  : grid de tarjetas de departamento

Departamento (nav.view = 'dept')
  → Vacío              : empty state centrado + botones "New folder" + "Upload document"
  → Con contenido      : grupos + docs sueltos
```

---

## Tarjetas de empresa

Cuando hay empresas pero ninguna activa, el contenido muestra un **grid de tarjetas** (mismo patrón que departamentos):

- Icono `ti-building` naranja en fondo `accent+'14'`
- Nombre de la empresa
- Hover: borde naranja + fondo `accent+'08'`
- Card `+ Nueva empresa` al final con borde punteado y hover naranja
- Click en tarjeta → `onSwitchCo(id)` → activa la empresa y muestra sus departamentos

### Breadcrumb de vuelta

Cuando `activeCo` está activo y `nav.view === 'all'` (dept grid), click en el nombre de empresa en el breadcrumb llama `onSwitchCo(null)` → regresa al grid de empresas.  
Cuando `nav.view` es `dept` o `group`, click en empresa va a `goTo('all')` (dept grid).

---

## Estados vacíos unificados

Todos los empty states siguen el mismo patrón visual:

```
[Icono 64×64 redondeado sobre fondo surface]
Título (16px 600)
Subtítulo descriptivo (13px muted, max 280px)
[Botón(es) de acción centrados]
```

| Nivel | Título | Botón(es) |
|-------|--------|-----------|
| Sin empresas | Sin empresas | `+ New company` (naranja) |
| Sin departamentos | Sin departamentos | `+ New department` (naranja) |
| Departamento vacío | Departamento vacío | `New folder` (naranja) + `Upload document` (secundario) |

---

## Modales unificados

Los tres modales de creación siguen el mismo patrón:

```
Título (15px 600)
Subtítulo contextual (12px muted) — menciona el padre: empresa o departamento
Input con autoFocus + Enter para confirmar
[Cancel]  [Create]  ← botones alineados a la derecha
```

| Modal | Subtítulo |
|-------|-----------|
| New company | — (solo título + input) |
| New department | "Organiza documentos y equipos dentro de {empresa}." |
| New folder | "Agrupa documentos dentro de {departamento}." |

---

## Controles del toolbar

| Control | Cuándo aparece |
|---------|----------------|
| `New folder` | **Eliminado del toolbar** — disponible en empty state y menú contextual |
| Búsqueda | Solo cuando `activeCo` está activo |
| Grid / List toggle | Solo cuando `activeCo` está activo |
| Breadcrumb | Solo cuando `activeCo` está activo |
| Doc count | Solo cuando `activeCo` está activo |

---

## Props añadidas a DocumentsPage

| Prop | Tipo | Función |
|------|------|---------|
| `onNewCo` | `() => void` | Abre modal de nueva empresa |
| `onSwitchCo` | `(id: string\|null) => void` | Activa/desactiva empresa |

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app.js` | Topbar, DocumentsPage, estados vacíos, modales, breadcrumb |
| `documentacion/funcionalidades.md` | Sección Documents y Topbar actualizadas |
| `colaboraciones/014-documents-navegacion-estados.md` | Este archivo |
