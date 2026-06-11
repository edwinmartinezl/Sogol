# 008 — Vista Policies

**Fecha:** 2026-06-10  
**Estado:** Completado

---

## Qué se construyó

Vista `/policies` con gestión de acceso por documento. Reemplaza el placeholder anterior.

---

## Layout

```
[Sidebar global 210px] │ [PoliciesPage]
                         ├── [PolicyListPanel 320px] │ [PolicyDetail flex:1]
                         │     Header + New policy    │   Card de detalle
                         │     Lista de policy cards  │   fondo C.surface
```

---

## Datos mock

```js
const POLICIES = [
  { id:'p1', name:'Cierre Mensual',    docs:['doc-001','doc-002','doc-006'], roles:['CEO','CFO','Contador'],  status:'active', created:'2024-03-01' },
  { id:'p2', name:'Auditoría Externa', docs:['doc-002','doc-004','doc-005'], roles:['Auditor'],               status:'active', created:'2024-02-15' },
  { id:'p3', name:'Análisis IT',       docs:['doc-002','doc-007'],           roles:['CTO','IT Manager'],      status:'draft',  created:'2024-03-10' },
  { id:'p4', name:'Vista RRHH',        docs:['doc-004'],                     roles:['RRHH'],                  status:'active', created:'2024-01-20' },
];
```

Definido a nivel de módulo en `app.js` (junto al resto de datos mock).

---

## Componente `PoliciesPage`

### Estado local

| State | Tipo | Descripción |
|-------|------|-------------|
| `selId` | `string \| null` | ID de la política seleccionada |
| `accessLv` | `'full' \| 'doc' \| 'temp'` | Nivel de acceso seleccionado en el detalle |

### Panel izquierdo

Cada card de política:
- Nombre + badge `Active` (verde) / `Draft` (gris)
- Pills de docs con icono de tipo + nombre truncado
- Pills de roles con icono `ti-user`
- Click → `setSelId(p.id)` + reset `accessLv` a `'full'`

### Panel derecho

Cuando `!policy`: estado vacío con icono `ti-shield-check`.

Cuando hay política seleccionada:

```
┌─────────────────────────────────────────────┐
│  Cierre Mensual  [Active]         [Edit]     │
│  Creada el 1 de marzo de 2024                │
├─────────────────────────────────────────────┤
│  ⚠ El LLM solo ve vectores de docs          │
│    permitidos. Control en capa de datos.     │
├─────────────────────────────────────────────┤
│  DOCUMENTS IN POLICY                         │
│  [📊 Ventas Q1]  [📄 Inf. Financiero]  ...  │
├─────────────────────────────────────────────┤
│  ACCESS ROLES                                │
│  [👤 CEO]  [👤 CFO]  [👤 Contador]          │
├─────────────────────────────────────────────┤
│  ACCESS LEVEL                                │
│  ┌──────────┬─────────────┬──────────────┐  │
│  │Full mod. │Document only│Temporary 24h │  │
│  │ (activo) │             │              │  │
│  └──────────┴─────────────┴──────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Constante `ACCESS_LEVELS`

```js
const ACCESS_LEVELS = [
  { key:'full', icon:'ti-layout-grid',  label:'Full module',     desc:'Acceso completo a todos los vectores' },
  { key:'doc',  icon:'ti-file-text',    label:'Document only',   desc:'Solo el documento, sin metadatos' },
  { key:'temp', icon:'ti-clock',        label:'Temporary (24h)', desc:'Acceso expira automáticamente' },
];
```

---

## Filosofía de seguridad documentada

La nota de seguridad en el panel de detalle explica el modelo:

> "El LLM solo accede a vectores de los documentos permitidos por esta política. El control se aplica en la capa de datos, no en el modelo."

Esto refleja la arquitectura real: el acceso no se gestiona con prompts o instrucciones al LLM, sino controlando qué vectores entran en el contexto de inferencia.

---

## Archivos modificados

| Acción | Archivo |
|--------|---------|
| Modificado | `app.js` — `POLICIES`, `ACCESS_LEVELS`, `PoliciesPage`, render en App |
| Modificado | `documentacion/funcionalidades.md` — sección Policies completa |
| Modificado | `documentacion/arquitectura.md` — sección Seguridad + actualización renderer Graphs |
| Creado | `colaboraciones/008-policies.md` |
