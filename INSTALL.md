# Installation – Bynex Tid 1.0 + AI Core

Paketet innehåller endast nya eller ersatta filer och ska kopieras ovanpå befintligt repo.

```bash
cd ~/Desktop/bynex-core
cp -R /sökväg/till/bynex-time-ai-patch/. ./
rm -rf .next
npm run typecheck
npm run dev
```

För riktig AI:

```bash
cp .env.example .env.local
```

Öppna `.env.local` och lägg in din servernyckel. Lägg aldrig nyckeln i en klientkomponent eller GitHub.
