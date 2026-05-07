# Info til ChatGPT

Oppdatert: 2026-05-07

Dette dokumentet er en kort prosjekt- og kodebasekontekst for FormFuel, slik at ChatGPT raskt kan forstå hva appen gjør, hvordan den er bygget, og hvor relevante filer ligger.

## Prosjektoversikt

FormFuel er en iPhone-først fitness-app bygget med React Native, Expo og TypeScript. Appen kombinerer treningslogging, kostholdsdagbok, fremdriftssporing og profil/mål i én local-first mobilapp.

Kjernen i produktet er at brukeren skal kunne svare på tre daglige spørsmål:

- Hva er statusen min for trening og ernæring i dag?
- Hva er neste nyttige handling?
- Gir vanene mine målbar fremgang over tid?

Appen fungerer lokalt med Expo SQLite som primær datakilde. Supabase er lagt inn som valgfri backend-grense for auth, Postgres og synk via Edge Functions, men lokal demo-bruker brukes når Supabase-miljøvariabler ikke er konfigurert.

## Teknologistack

- React Native 0.81 og React 19.
- Expo SDK 54.
- TypeScript med `strict: true`.
- React Navigation for root stack, bottom tabs og detaljskjermer.
- TanStack Query for repository-lesinger, caching og invalidation.
- Zustand for global app-/UI-state.
- Expo SQLite for lokal database.
- Supabase JS for valgfri auth og sync.
- Zod for skjemavalidering.
- Jest med `jest-expo` for tester.
- `@/*` er alias til `src/*`, definert i `tsconfig.json` og `babel.config.js`.

Viktige scripts i `package.json`:

```sh
npm run start
npm run ios
npm run android
npm run web
npm run typecheck
npm run test
npm run import:oda-foods
```

## Hovedfunksjonalitet

### Auth og onboarding

- `App.tsx` starter appen ved å initialisere SQLite, seed-data og auth/onboarding-state.
- `src/services/auth/authService.ts` bruker SecureStore med AsyncStorage fallback.
- Supabase email-signin brukes hvis Supabase er konfigurert.
- Lokal demo-bruker brukes ellers.
- Onboarding valideres med Zod og lagrer profil, mål og innstillinger lokalt.

### Home

- `src/features/home/screens/HomeScreen.tsx`
- Daglig dashboard med kalorier, makroer, vann, dagens treningsplan og quick actions.
- Leser data via `useDashboard()` og repository-laget.
- Viser workout-status og oppdateres når trening eller mat logges.

### Workouts

- `src/features/workouts/screens/WorkoutDashboardScreen.tsx`
- Faner for Today, Program, History og Exercises.
- Støtter treningsrutiner, ukesprogram, live workout, set logging, rest timer, historikk, PR-er og øvelseshistorikk.
- Live workout-komponentene ligger i `src/features/workouts/components/live`.
- Programplanlegging lagres i lokal database via `workout_program_days`.
- Repository-funksjoner ligger i `src/data/repositories/workoutRepository.ts`.

### Nutrition

- `src/features/nutrition/screens/NutritionDiaryScreen.tsx`
- Faner for Diary, Search, Meals og Goals.
- Støtter matdagbok per dato og måltid, matsøk, quick-add, custom foods, saved meals, recipes, vannlogging og koffein.
- Barcode scanner-skjermen og provider-grensen finnes, men reell ekstern barcode-provider er foreløpig ikke aktivert.
- Lokal matprovider ligger i `src/services/food/foodProviders.ts`.
- Repository-funksjoner ligger i `src/data/repositories/nutritionRepository.ts`.

### Progress

- `src/features/progress/screens/ProgressScreen.tsx`
- Viser tidsfilter, overview-moduler og datadrevne custom stats.
- Progress widgets støtter body-, nutrition-, training- og exercise-metrikker.
- Widget-katalog og typer ligger i `src/features/progress/widgets`.
- Data hentes fra `src/data/repositories/progressWidgetsRepository.ts`.

### Profile og settings

- `src/features/profile/screens/ProfileScreen.tsx`
- Viser og oppdaterer profil, mål, enheter, sync-status og relaterte innstillinger.
- Repository-funksjoner ligger i `src/data/repositories/settingsRepository.ts`.

## Arkitektur og dataflyt

Appen er organisert rundt disse lagene:

1. Screens og komponenter i `src/features` og `src/components`.
2. Hooks i `src/hooks/useAppQueries.ts` som pakker TanStack Query rundt repository-funksjoner.
3. Repository-laget i `src/data/repositories`, som skjuler SQL og databasekartlegging fra UI.
4. Lokal SQLite-database i `src/data/db/database.ts`.
5. Rene domenetyper og beregninger i `src/domain`.
6. Valgfri Supabase-sync i `src/data/sync`.

Typisk leseflyt:

```text
Screen -> useAppQueries hook -> repository -> SQLite -> domain mapper/totals -> UI
```

Typisk skriveflyt:

```text
Screen action -> repository mutation -> SQLite write -> optional sync_queue row -> query invalidation
```

Core writes skal gå til SQLite først. Sync skal behandles som en bakgrunnsgrense, ikke som en forutsetning for at appen fungerer.

## Lokal database og sync

`src/data/db/database.ts` åpner `formfuel.db`, kjører `MIGRATION_SQL`, sikrer nyere kolonner med idempotente `ALTER TABLE`-steg og seeder demo-data via `src/data/seed/sampleData.ts`.

Datamodellen dekker blant annet:

- Bruker, profil, mål, enheter og settings.
- Øvelser, rutiner, workout sessions, workout exercises, workout sets og PR-er.
- Body weight logs og body measurements.
- Food items, food servings, saved meals, recipes, diary days, diary entries, water logs og koffein.
- `sync_queue` for pending writes mot Supabase.

Mer detaljert schema-dokumentasjon finnes i `docs/DATA_SCHEMA.md`.

Supabase-grensen:

- `src/data/sync/supabase.ts` oppretter klient hvis env er satt.
- `src/data/sync/syncQueue.ts` legger lokale operasjoner i kø.
- `src/data/sync/syncService.ts` sjekker nettverk, auth og sender pending operasjoner til Edge Function `sync-upsert`.
- Supabase-migrasjoner ligger i `supabase/migrations`.
- Edge Function ligger i `supabase/functions/sync-upsert/index.ts`.

## Filstruktur

```text
.
├── App.tsx                         # App bootstrap: QueryClient, database init, auth restore, RootNavigator
├── index.ts                        # Expo entrypoint
├── app.json                        # Expo app-konfig
├── package.json                    # Scripts og avhengigheter
├── tsconfig.json                   # TypeScript config og @/* alias
├── babel.config.js                 # Expo Babel config, module-resolver og Reanimated plugin
├── README.md                       # Overordnet prosjektstatus og endringslogg
├── Info til ChatGPT.md             # Denne kontekstfilen
├── docs/
│   ├── PRODUCT_TECHNICAL_PLAN.md   # Produktkrav, arkitektur og plan
│   ├── DATA_SCHEMA.md              # Datamodell og sync-regler
│   ├── IOS_SIMULATOR_QUICKSTART.md # iOS simulator-notater
│   ├── ODA_PRIVATE_IMPORT.md       # Oda-import dokumentasjon
│   └── AI_HANDOFF_2026-04-26.txt   # Tidligere AI-handoff
├── src/
│   ├── components/                 # Delt UI: Button, Card, Screen, AppText, Empty/Loading states, progress cards
│   ├── data/
│   │   ├── db/                     # SQLite init, migrations og id-konstanter
│   │   ├── repositories/           # Dashboard, workout, nutrition, settings og progress data access
│   │   ├── seed/                   # Demo-/sampledata
│   │   └── sync/                   # Supabase client, sync queue og background sync
│   ├── domain/
│   │   ├── calculations/           # Rene date-, unit-, workout- og nutrition-beregninger
│   │   ├── validation/             # Zod-skjemaer
│   │   └── models.ts               # Domenetyper og interfaces
│   ├── features/
│   │   ├── auth/                   # Auth og onboarding screens
│   │   ├── home/                   # Home dashboard
│   │   ├── nutrition/              # Nutrition diary, search, saved meals, custom food, barcode placeholder
│   │   ├── profile/                # Profil og settings
│   │   ├── progress/               # Progress screen, stat config og widget-katalog
│   │   └── workouts/               # Workout dashboard, live logging, program, history og exercise history
│   ├── hooks/                      # TanStack Query hooks og query keys
│   ├── navigation/                 # RootNavigator, tab metrics og navigation types
│   ├── services/                   # Auth service og food provider-grense
│   ├── stores/                     # Zustand stores
│   ├── theme/                      # Design tokens og theme hook
│   └── types/                      # Ekstra TypeScript declarations
├── __tests__/                      # Jest-tester for workout, nutrition og Oda-import
├── scripts/
│   └── import-oda-foods.js         # Importscript for Oda private food snapshot
├── supabase/
│   ├── config.toml                 # Supabase local config
│   ├── functions/sync-upsert/      # Edge Function for sync-upsert
│   └── migrations/                 # Remote Postgres schema/migrations
├── assets/                         # App icons, splash og noen aktivitetsikoner
├── ios/                            # Generert/native iOS-prosjekt
├── android/                        # Generert/native Android-prosjekt
└── output/                         # Demo-/video-output, ikke kjerneappkode
```

## Viktige filer å starte med

- `App.tsx`: appens bootstrap og global provider-oppsett.
- `src/navigation/RootNavigator.tsx`: auth/onboarding/main-tabs flow og stack-skjermer.
- `src/hooks/useAppQueries.ts`: samlet oversikt over hvilke repositories UI-et leser fra.
- `src/data/db/database.ts`: lokal schema-definisjon, idempotente lokale migreringer og seed.
- `src/domain/models.ts`: hovedtyper for bruker, trening, nutrition, progress og dashboard.
- `src/data/repositories/workoutRepository.ts`: treningslogikk og SQL.
- `src/data/repositories/nutritionRepository.ts`: matdagbok, matsøk, saved meals, vann og koffein.
- `src/data/repositories/progressWidgetsRepository.ts`: progress overview og custom widgets.
- `src/data/repositories/settingsRepository.ts`: profil, mål, enheter og innstillinger.
- `docs/PRODUCT_TECHNICAL_PLAN.md`: produkt- og arkitekturintensjon.
- `docs/DATA_SCHEMA.md`: mest presise schema-beskrivelse.

## Konvensjoner og arbeidsregler

- Behold local-first-prinsippet: appen skal fungere uten Supabase.
- Ikke la screens skrive SQL direkte; bruk repository-laget.
- Bruk `@/` alias for interne imports.
- Hold domeneberegninger rene og testbare i `src/domain/calculations`.
- Bruk Zod-skjemaer for skjema-/write-validering.
- Når nye data skal vises i UI, legg helst en repository-funksjon og en hook i `useAppQueries.ts`.
- Husk å invalidere relevante query keys etter writes.
- Bruk stabile UUID-er for syncbare rader.
- Ikke behandle `node_modules`, `.expo`, `ios/build`, `ios/Pods`, `.temp` eller `output` som primær kildekode.

## Kjente begrensninger og neste steg

- Supabase-syncgrensen finnes, men full produksjonsklar konfliktløsning og remote flyt bør videreutvikles.
- Barcode scanner er arkitektert, men ekstern barcode lookup-provider er ikke ferdig aktivert.
- HealthKit/Health Connect er ikke implementert.
- Flere repository-integrasjonstester bør legges til for live workout og diary writes.
- Det finnes native `ios/` og `android/` mapper, men Expo/React Native-koden i `src/` er hovedlaget for appfunksjonalitet.

