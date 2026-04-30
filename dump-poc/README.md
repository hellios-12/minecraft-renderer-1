# dump-poc

Временная (PoC) папка для миграции с `convertChunkToWasm` на `column.dump()` для версий 1.18+.

## Зачем

Сейчас в worker'е (`src/mesher/mesherWasm.ts` → `src/wasm-lib/convertChunk.ts`) колонка
конвертируется в 4 typed-array (`blockStates u16`, `blockLight u8`, `skyLight u8`, `biomes u8`)
вручную через JS-обход. Это медленно и держит лишний JS-код.

`prismarine-chunk` уже умеет `column.dump()` → раздаёт network-format buffer, который мы
можем парсить в Rust-стороне напрямую и собирать те же 4 typed-array без JS-bridge.

## Стратегия

См. `docs/issues/issue-15-wasm/research/dump-research.md` и
`docs/issues/issue-15-wasm/research/wasm-file-structure-refactor.md`.

Кратко:

- Скоуп: только формат 1.18+. Для 1.8–1.17 оставляем `convertChunkToWasm` как fallback
  (отдельная задача, если когда-то понадобится).
- Главный риск: **незаметные баги** при парсинге dump (Single/Indirect/Direct palette,
  BitArray-флейворы, edge cases). Защита — conformance harness ниже + параллельный прогон
  в production.
- Кэш `mesherWasmConversionCache` сносим в один заход с переездом на dump-путь.

## Содержимое папки

```
dump-poc/
├── README.md                 — этот файл
├── fixtures/                 — сгенерированные dump'ы для разных сценариев
│   └── *.json                — { meta, dump (base64), reference (base64 typed-arrays) }
├── generate-fixtures.cjs     — генератор fixtures через prismarine-chunk
├── parseDump-1.18.cjs        — JS-прототип парсера (валидируем понимание формата)
└── harness.cjs               — гоняет parseDump против эталона из fixtures, diff'ит
```

## Workflow

1. `node dump-poc/generate-fixtures.cjs` — генерит fixtures (idempotent).
2. `node dump-poc/harness.cjs` — гоняет prototype через fixtures, diff байт-в-байт.
3. Когда JS-прототип сходится 100% → переписываем в Rust внутри `wasm-mesher/`.
4. В worker'е добавляем флаг `DUMP_PARALLEL_RUN` — оба пути считают, diff в `console.warn`.
5. После 1-2 дней чистого diff'а в проде → switchover, удаляем `convertChunkToWasm`.

## Сценарии fixtures

Пытаемся покрыть все ветки формата:

- **empty** — все секции пустые, нулевые палитры
- **single-block** — full of stone (single-value palette)
- **indirect-palette** — несколько блоков, < 256 уникальных (indirect palette с битами)
- **direct-palette** — много уникальных state'ов (direct palette)
- **with-light** — с блочным и небесным освещением
- **mixed-biomes** — несколько биомов в разных секциях
- **section-boundary** — блоки на границах секций (heightmap edge case)

## Когда удалять

После того как dump-путь в Rust работает в production без diff'ов и старый
`convertChunkToWasm` удалён. Переехать в `src/wasm/tests/` (если согласован рефактор) или
просто удалить.
