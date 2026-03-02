# DuoCode – AI Pair Programming CLI

## Co to je
CLI nástroj, kde **Claude (implementátor)** píše kód a **Codex/GPT (supervizor)** ho průběžně kontroluje. Podporuje interaktivní REPL i one-shot režim (`duocode ask "..."`).

## Struktura projektu

```
bin/duocode.ts          # CLI entry point (Commander.js)
src/
  cli.ts                # Definice příkazů a options
  index.ts              # DuoCode třída – hlavní orchestrátor, REPL loop
  config/               # Konfigurace (~/.duocode/config.json), setup wizard, Zod schema
  context/              # Skenování projektu, čtení souborů, gitignore filtr
  models/               # ClaudeAdapter + CodexAdapter (Anthropic/OpenAI SDK wrappery)
    types.ts            # Klíčové typy: SupervisorVerdict, ImplementationStep, ToolCall...
  orchestrator/         # ImplementationLoop, Supervisor, DualAnalysis, SessionManager
  tools/                # Tool registry + handlery (file_read/write/edit, shell_exec, git_*)
  git/                  # GitManager (simple-git), ChangeTracker (rollback)
  ui/                   # Terminal output, spinner, stream renderer, diff display
  utils/                # Logger, token counter
scripts/
  build-exe.mjs         # Node SEA build (esbuild → blob → postject)
  build-installer.mjs   # Spouštěč Inno Setup ISCC
installer/
  duocode-setup.iss     # Inno Setup skript (instalace do Program Files + PATH)
```

## Build pipeline

| Script | Co dělá |
|--------|---------|
| `npm run build` | TypeScript → `dist/` |
| `npm run bundle` | esbuild bundle → `build/duocode-bundled.cjs` → SEA blob → `build/duocode.exe` |
| `npm run build:exe` | `build` + `bundle` dohromady |
| `npm run build:installer` | Vyžaduje Inno Setup 6; vytvoří `build/duocode-installer.exe` |
| `npm run build:all` | `build:exe` + `build:installer` |

SEA (Single Executable Application) balí Node.js runtime + bundlovaný kód do jednoho `.exe`.

## Klíčové konvence

- **TypeScript strict mode**, target ES2022, module Node16
- ESM (`"type": "module"` v package.json), ale SEA bundle je CJS
- Konfigurace uživatele: `~/.duocode/config.json` (API klíče, modely, supervision mode)
- Env proměnné `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` mají přednost před configem
- Supervision modes: `issues-only` (výchozí), `always`, `never`
- Claude má k dispozici tools (file_read/write/edit, file_list, shell_exec, git_status/diff/commit)
- Codex/GPT je **jen review** – nevolá žádné tools
- Token budget omezuje kontext projektu i historii konverzace
- ChangeTracker umožňuje rollback bez gitu

## Architektura workflow

1. Uživatel zadá prompt
2. Claude analyzuje a navrhne plán
3. (Volitelně) Codex review plánu
4. ImplementationLoop: Claude volá tools → supervisor kontroluje každý krok
5. Při problémech se feedback vrací Claudovi a loop pokračuje (max `maxSteps`)
6. Shrnutí + nabídka commitu

## REPL příkazy

`/help`, `/config`, `/model`, `/status`, `/context`, `/review`, `/commit`, `/rollback`, `/clear`, `/exit`

## Runtime prerekvizity (pro uživatele)

- **Git** nainstalovaný v PATH
- **API klíče** (Anthropic + OpenAI) – wizard při prvním spuštění
- **Internet** – komunikace s API
- Node.js **není potřeba** (součást SEA exe)

## Instalace pro uživatele

```powershell
irm https://www.prosecky.cz/duocode-installer.exe -OutFile "$env:TEMP\duocode-installer.exe"; & "$env:TEMP\duocode-installer.exe"
```

## Testy

Zatím žádné automatizované testy. QA je manuální.
