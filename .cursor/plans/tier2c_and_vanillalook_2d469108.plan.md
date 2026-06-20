---
name: Tier2c and vanillaLook
overview: Implement essential Tier 2c stability fixes and per-frame CPU reductions for global buffers, plus real-time vanillaLook for instanced shader cubes via GPU uniforms. Legacy geometry mesher migration is deferred to a follow-up PR per your choice.
todos:
  - id: cube-shading-uniform
    content: Add u_shadingTheme/u_cardinalLight to cubeBlockShader + setShadingTheme wiring via watchReactiveConfig
    status: pending
  - id: legacy-multidraw
    content: Create legacyMultiDraw.ts and wire GlobalLegacyBuffer onAfterRender + suppressThreeDraw
    status: pending
  - id: legacy-compact-grow
    content: Port compactStep to GlobalLegacyBuffer; fix growCapacity to preserve pendingRanges
    status: pending
  - id: cpu-cull-registry
    content: Add globalCullSections registry + cull fingerprint skip + bulk a_origin fill
    status: pending
  - id: legacy-raycast-aabb
    content: Replace triangle raycastSections hot path with section AABB hit
    status: pending
  - id: tests
    content: Extend globalLegacyBuffer and cube shading tests; verify chunkMeshManagerLegacy regressions
    status: pending
isProject: false
---

# Tier 2c stability, CPU cuts, and vanillaLook (cubes)

## Goals

1. **Tier 2c essentials** — legacy global buffer gets raw multi-draw, compaction, and safer growth (parity with `[GlobalBlockBuffer](src/three/globalBlockBuffer.ts)`).
2. **Minimize per-frame CPU** — fewer all-section scans, skip redundant span rebuilds, cheaper section uploads.
3. **vanillaLook gaps (cubes only in this PR)** — face-direction shading in the cube fragment shader via `u_shadingTheme`; toggle updates a uniform, no remesh.

**Out of scope (follow-up PR):** legacy mesher unbake (`tint`-only colors + `a_ao` attr) so legacy blocks also respond to `vanillaLook` in real time.

---

## Current gaps (baseline)

```mermaid
flowchart TB
  subgraph perFrame [Per-frame render loop]
    rebase[maybeRebase]
    camOrigin[setCameraOrigin x3]
    compactCubes[compactStep cubes only]
    upload[uploadDirtyRange x3]
    cullDirty[cullDirty check]
    cullAll[updateSectionCullAndSort ALL sectionObjects]
    threeDraw[Three.js render]
  end
  rebase --> camOrigin --> compactCubes --> upload --> cullDirty --> cullAll --> threeDraw
```




| Area                  | Today                                               | Target                                                                  |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| Legacy draws          | Up to 64 `geometry.addGroup` sub-draws via Three.js | 1× `WEBGL_multi_draw_elements` batch (Tier A/B) or capped loop (Tier C) |
| Legacy defrag         | None; holes accumulate                              | `compactStep()` like cubes                                              |
| Legacy `growCapacity` | Clears `pendingRanges`                              | Preserve + merge pending uploads                                        |
| Cull                  | O(all `sectionObjects`) every camera move           | O(sections with global GPU data) + skip if visible set unchanged        |
| vanillaLook cubes     | AO only; no face-direction term                     | `u_shadingTheme` × side shading from `v_faceId`                         |
| vanillaLook legacy    | Baked in mesher `color`                             | **Follow-up PR**                                                        |


---

## Phase 1 — Real-time vanillaLook for shader cubes (GPU only)

### 1.1 Shared GLSL shading helpers

Add a small shared GLSL snippet (new file e.g. `[src/three/shaders/vertexShading.glsl.ts](src/three/shaders/vertexShading.glsl.ts)` or inline in `[cubeBlockShader.ts](src/three/shaders/cubeBlockShader.ts)`) mirroring `[vertexShading.ts](src/mesher-shared/vertexShading.ts)`:

- `sideShadingFromFaceId(faceId, u_shadingTheme, u_cardinalLight)` — reproduce high-contrast vs vanilla (+ nether) formulas using face normals implied by faceId (0=up … 5=north).
- `aoFactorFromLevel(aoLevel, u_shadingTheme)` — high-contrast: `(ao+1)/4`; vanilla: `ao*0.2+0.4`.

### 1.2 Cube shader changes — `[cubeBlockShader.ts](src/three/shaders/cubeBlockShader.ts)`

New uniforms on `createCubeBlockMaterial`:

```ts
u_shadingTheme: { value: 1.0 }   // 0 = vanilla, 1 = high-contrast
u_cardinalLight: { value: 0.0 } // 0 = default, 1 = nether
```

Fragment shader (replace flat `Lm * v_ao`):

```glsl
float side = sideShadingFromFaceId(v_faceId, u_shadingTheme, u_cardinalLight);
float aoF  = aoFactorFromLevel(/* decode from v_ao */, u_shadingTheme);
float brightness = applyLightmap(L) * aoF * side;
```

`v_ao` is already `(aoLevel+1)/4`; either pass raw ao as a flat varying or decode: `aoLevel = v_ao * 4.0 - 1.0`.

### 1.3 Runtime wiring


| File                                                                   | Change                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `[rendererOptionsSync.ts](src/graphicsBackend/rendererOptionsSync.ts)` | Already sets `cfg.shadingTheme` from `vanillaLook` — no change                                                           |
| `[worldRendererThree.ts](src/three/worldRendererThree.ts)`             | `watchReactiveConfig('shadingTheme')` + `watchReactiveConfig('cardinalLight')` → `chunkMeshManager.setShadingTheme(...)` |
| `[chunkMeshManager.ts](src/three/chunkMeshManager.ts)`                 | New `setShadingTheme(theme, cardinalLight)` updating cube material (+ stub for legacy materials for follow-up)           |


**No remesh, no worker messages** — same pattern as `setSkyLevel`.

### 1.4 Tests

Extend `[shaderCubeInstances.test.ts](src/wasm-mesher/tests/shaderCubeInstances.test.ts)` or add a small shader-uniform unit test asserting `setShadingTheme` writes expected uniform values. Visual parity: compare up vs side face brightness with `vanillaLook` on/off in playground.

---

## Phase 2 — Legacy Tier 2c stability

### 2.1 Raw multi-draw for legacy — new `[legacyMultiDraw.ts](src/three/legacyMultiDraw.ts)`

Mirror `[cubeMultiDraw.ts](src/three/cubeMultiDraw.ts)` but for **indexed** draws:

- Reuse `detectMultiDrawCaps()` (Tier A: `WEBGL_multi_draw` + `multiDrawElementsWEBGL`; Tier B: loop `drawElements`; Tier C: loop).
- Span type: `{ indexStart: number, indexCount: number }` (already implied by quad slots × 6).
- Scratch buffers: `Int32Array` for starts/counts per span.

### 2.2 `[GlobalLegacyBuffer](src/three/globalLegacyBuffer.ts)` render path

Follow `[GlobalBlockBuffer](src/three/globalBlockBuffer.ts)` pattern:

1. Add `visibleIndexSpans: LegacyDrawSpan[]`, `setVisibleIndexSpans(spans)`.
2. `mesh.onAfterRender` → `drawLegacySpans(gl, caps, spans, indexBuffer, ...)`.
3. `suppressThreeDraw()` — `setDrawRange(0, 0)` so Three.js does not draw the full watermark.
4. **Remove** `geometry.addGroup` / `clearGroups` from `updateDrawSpans` — it only builds the span list now (rename to `setVisibleSections` or keep name, change behavior).

Blend buffer: preserve back-to-front order by emitting spans sorted by `distSq` (already done); multi-draw order = draw order.

### 2.3 Legacy `compactStep()`

Port logic from `[GlobalBlockBuffer.compactStep](src/three/globalBlockBuffer.ts)` (~lines 273–301):

- Same `FRAGMENTATION_THRESHOLD = 0.25`, one interior-hole move per frame, `pendingMove` with old/new slot until upload completes.
- Operates on **quad slots** (copy vertex + index ranges, rebase indices with `vertexBase` offset).
- Call from render loop in `[worldRendererThree.ts](src/three/worldRendererThree.ts)` alongside cube `compactStep()`.

### 2.4 Safer `growCapacity`

In `[globalLegacyBuffer.ts](src/three/globalLegacyBuffer.ts)` `growCapacity` (~line 568):

- **Do not** `this.pendingRanges.length = 0` — remap pending ranges to new array offsets or re-`markDirty` affected slots.
- Optionally bump `DEFAULT_INITIAL_CAPACITY_QUADS` to reduce mid-game growth (configurable, no behavior change).

### 2.5 Tests

Extend `[globalLegacyBuffer.test.ts](src/three/tests/globalLegacyBuffer.test.ts)`:

- Span builder produces same ranges as today (regression).
- `compactStep` reduces high watermark after remove/load cycle.
- `growCapacity` preserves pending upload queue.

---

## Phase 3 — Per-frame CPU reductions

### 3.1 Cull registry (avoid scanning all sections)

In `[chunkMeshManager.ts](src/three/chunkMeshManager.ts)`:

- Maintain `globalCullSections: Map<string, { worldX, worldY, worldZ }>` — add on `GlobalLegacyBuffer.addSection` / `GlobalBlockBuffer.addSection` / `registerShaderSectionRaycastBox`; remove on `releaseSection`.
- `updateSectionCullAndSort`: frustum-test **only** `globalCullSections` (+ separate `pooledLegacySections` set for sci-fi/fallback meshes).
- Still read `sectionObject.visible` via `sectionObjects[key]` when present.

### 3.2 Skip redundant span rebuild

Cache last cull fingerprint on manager:

```ts
private _lastCullFingerprint = ''
// fingerprint = sorted visible section keys joined, or hash
```

If camera moved (`cullDirty`) but fingerprint unchanged after frustum pass → skip `updateDrawSpans` / `buildVisibleCubeSpans` / `setVisibleSpans`.

### 3.3 Cheaper `a_origin` fill

In `GlobalLegacyBuffer.addSection` (~lines 171–176): replace per-vertex loop with bulk write — set 3 floats once, then `aOrigin.fill(sx-rx, originOff, originOff+vertCount*3)` pattern or copy a prebuilt 4-vert template per section.

### 3.4 Raycast fast path (optional but high CPU win)

In `[chunkMeshManager.ts](src/three/chunkMeshManager.ts)` `raycastLegacyBlocksDistance` (~668): replace `raycastSections` triangle loop with **section AABB hit only** (same rationale as `[shaderCubeMesh.ts](src/three/shaderCubeMesh.ts)` comment — block pick uses mineflayer). Keep triangle raycast behind a debug flag if needed for tooling.

### 3.5 Render loop ordering (no extra work)

`[worldRendererThree.ts](src/three/worldRendererThree.ts)` render path stays:

```
maybeRebase → setCameraOrigin → compactStep (cubes + legacy) → uploadDirtyRange → cull (if dirty) → render
```

Add legacy `suppressThreeDraw()` before render (mirrors cubes).

---



---

## File touch summary


| File                                                                       | Phase                 |
| -------------------------------------------------------------------------- | --------------------- |
| `[cubeBlockShader.ts](src/three/shaders/cubeBlockShader.ts)`               | 1                     |
| `[chunkMeshManager.ts](src/three/chunkMeshManager.ts)`                     | 1, 3                  |
| `[worldRendererThree.ts](src/three/worldRendererThree.ts)`                 | 1, 2, 3               |
| `[legacyMultiDraw.ts](src/three/legacyMultiDraw.ts)`                       | 2 (new)               |
| `[globalLegacyBuffer.ts](src/three/globalLegacyBuffer.ts)`                 | 2, 3                  |
| `[globalLegacyBuffer.test.ts](src/three/tests/globalLegacyBuffer.test.ts)` | 2                     |
| `[cubeMultiDraw.ts](src/three/cubeMultiDraw.ts)`                           | 2 (reuse caps helper) |


**Explicitly not changing:** mesher worker contract, `MesherGeometryOutput`, WASM bridge color packing (follow-up PR).

---

## Validation checklist

- Toggle `vanillaLook` in prismarine-web-client: cube faces change brightness instantly (no chunk reload).
- High render distance: frame time stable; legacy draw call count ≤ span cap (64) or 1 multi-draw.
- Load/unload many chunks: legacy buffer high watermark shrinks after `compactStep`.
- Large section upload during flight: no lost geometry after `growCapacity`.
- Existing `[chunkMeshManagerLegacy.test.ts](src/three/tests/chunkMeshManagerLegacy.test.ts)` + global legacy tests pass.

