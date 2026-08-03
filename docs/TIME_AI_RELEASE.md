# Bynex Tid 1.0 + AI Core

## Innehåll
- Lokal och beständig stämplingsmotor
- In/ut, rast och live-timer
- Browser-GPS vid stämpling
- OpenStreetMap-karta utan API-nyckel
- Projekt/uppdrag och arbetsmoment
- Resursregistrering och tidslinje
- Delad AI Core för hela Bynex
- OpenAI Responses API när `OPENAI_API_KEY` finns
- Säker lokal fallback utan API-nyckel

## Integritet
Position hämtas endast när användaren aktivt stämplar eller väljer **Hämta position**. Kontinuerlig spårning är inte aktiverad.

## AI
Kopiera `.env.example` till `.env.local` och fyll i `OPENAI_API_KEY`. Utan nyckel fungerar modulen med lokal fallback, så utveckling och demo blockeras inte.
