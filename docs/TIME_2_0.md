# Bynex Tid 2.0 – teknisk riktning

Den här versionen är en frontenddemo.

## Produktionssteg
1. Skapa datamodeller för raw time punches, approved time entries och GPS-verifiering.
2. Implementera autentisering och tenantbehörighet.
3. Använd webbläsarens geolocation endast vid explicita stämplingshändelser.
4. Inför offlinekö med klientgenererade UUID.
5. Audit-logga manuella korrigeringar.
6. Separera registrerad tid, godkänd tid och lönegrundande tid.
7. Lägg till avtalsregler för rast, övertid och OB som versionshanterade policies.
8. Koppla projektkostnad och löneprognos till faktiska löneparametrar.
