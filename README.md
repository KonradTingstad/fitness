# FormFuel (Fitness App)

Sist oppdatert: 2026-04-24

## Viktig vedlikeholdsregel

Denne README-en skal oppdateres hver gang kodebasen endres.

Minimum ved hver endring:

1. Oppdater relevante seksjoner under "Funksjonalitet", "Arkitektur" eller "Kjente begrensninger".
2. Legg til en ny linje i "Endringslogg" nederst med dato og hva som ble endret.
3. Oppdater "Sist oppdatert"-datoen pa toppen.

---

## Hva appen er

FormFuel er en local-first fitness-app (React Native + Expo) som kombinerer:

- treningslogging (routines, live workout, sett/reps/vekter, historikk, PR),
- kostholdsdagbok (matlogg per maltid, custom foods, saved meals, vann),
- fremdriftsskjerm med trends (volum, kalorier, kroppsvekt),
- profil/targets/sync-status.

Appen fungerer fullt lokalt via SQLite. Supabase er valgfritt og brukes kun nar det er konfigurert.

---

## Navigasjon og brukerflyt

### Oppstart

Ved appstart (`App.tsx`) skjer dette:

1. SQLite initieres (`initializeDatabase`).
2. Demo-data seedes ved tom database.
3. Auth/onboarding-state gjenopprettes fra SecureStore/AsyncStorage.

### Root flow

`RootNavigator` styrer hovedflyten:

- Ikke innlogget: `AuthScreen`
- Innlogget men onboarding ikke fullfort: `OnboardingScreen`
- Ellers: `MainTabs` + detaljskjermer

### Bottom tabs

- Home
- Workouts
- Nutrition
- Progress
- Profile

### Stack-skjermer

- `LiveWorkout`
- `WorkoutSummary`
- `ExerciseHistory`
- `FoodSearch`
- `CustomFood`
- `BarcodeScanner`

---

## Funksjonalitet (implementert na)

### 1) Auth og onboarding

- Email-signin mot Supabase dersom env er satt.
- Fallback til lokal demo-bruker hvis Supabase ikke er konfigurert.
- Onboarding valideres med Zod og skriver:
  - hoyde/vekt til `user_profiles`
  - kalori/protein/workouts per uke til `goal_settings`

### 2) Home

- Daglig dashboard med:
  - kalorier konsumert vs target
  - macros (protein/carbs/fat) med progressbars
  - "Today plan" (start workout / view workout / view summary)
  - hydration med "Add 250 ml"
- Quick actions:
  - Start workout
  - Log meal

### 3) Workouts

`WorkoutDashboardScreen` har 4 faner:

- `Today`: aktiv okt, forslag til neste okt, ukesstatus, lagrede rutiner
- `Program`: ukesplan + rutiner (UI hooks for redigering)
- `History`: fullforte okter med sammendrag
- `Exercises`: sok/filter, PR/last set-data, inngang til historikk

Live logging (`LiveWorkoutScreen`):

- oppretter okt fra rutine eller tom okt
- legger til ovelser og sett
- oppdaterer vekt/reps/settype
- markerer sett som fullfort
- rest timer (auto ved fullfort sett, pause, +30s, stopp)
- finish/discard av okt
- haptics ved sett-fullforing

Sammendrag (`WorkoutSummaryScreen`):

- varighet, sett, reps, volum
- liste over fullforte ovelser
- PR-liste (session PR)

Exercise history (`ExerciseHistoryScreen`):

- best set
- estimert 1RM
- volum-trend per okt
- nylige sett

### 4) Nutrition

`NutritionDiaryScreen` har 4 faner:

- `Diary`: kalorier/macros, maltidsseksjoner, log meal, barcode-ingang
- `Search`: sok/filter/chips, quick-add, recent searches
- `Meals`: saved meals + favoritter
- `Goals`: target-kort og progresjon pa kalorier/macros/vann

`FoodSearchScreen`:

- sok i lokal matdatabase
- fallback til recent foods nar query er tom
- rask logging til valgt maltid + dato
- inngang til custom food og barcode

`CustomFoodScreen`:

- oppretter custom food med Zod-validering
- lagrer i `food_items` og `custom_foods`
- logger maten direkte i dagboken etter lagring

`BarcodeScannerScreen`:

- arkitektur er pa plass
- faktisk provider-oppslag er ikke aktivert (placeholder-skjerm)

### 5) Progress

`ProgressScreen` viser:

- ukentlig treningsvolum (bar chart)
- kalorier (bar chart)
- kroppsvekt-trend (line chart)
- muskelgrupper-fordeling
- protein-snitt vs protein-mal

### 6) Profile

- viser profil/metrikk/goal/activity
- enkel redigering av kalorier/protein target
- viser unit-preferanser
- sync-status og manuell "Sync now"
- sign out

---

## Data, lagring og sync

### Lokal datakilde (source of truth)

- SQLite (`expo-sqlite`) er primar datakilde.
- Tabellenes schema opprettes i `src/data/db/database.ts`.
- Seed-data legges inn i `src/data/seed/sampleData.ts` for demo-bruker.

### Sync-kjo

- Endringer pa syncbare entiteter legges i `sync_queue` via `enqueueSync(...)`.
- `runBackgroundSync()`:
  - sjekker nettverk (`expo-network`)
  - sjekker Supabase-konfig
  - sjekker autentisert session
  - sender batch til Edge Function `sync-upsert`

### Supabase boundary

Lokale filer:

- klient: `src/data/sync/supabase.ts`
- sync-service: `src/data/sync/syncService.ts`
- edge function: `supabase/functions/sync-upsert/index.ts`
- migrasjon: `supabase/migrations/20260422_formfuel_sync.sql`

Hvis Supabase ikke er konfigurert, fortsetter appen i lokal modus uten datatap lokalt.

---

## Teknisk arkitektur

### Stack

- React Native + Expo + TypeScript
- React Navigation (stack + tabs)
- Zustand (app/session state)
- TanStack Query (fetch/cache/invalidation)
- Expo SQLite (lokal lagring)
- Supabase (valgfri cloud sync boundary)
- Zod (input-validering)
- react-native-gifted-charts (grafer)

### App state

`src/stores/appStore.ts`:

- `userId`
- `hasCompletedOnboarding`
- `selectedDiaryDate`
- `selectedMealSlot`
- `pendingSyncCount`

### Domain-lag

- Modeller: `src/domain/models.ts`
- Kalkulasjoner:
  - `src/domain/calculations/workout.ts`
  - `src/domain/calculations/nutrition.ts`
  - `src/domain/calculations/dates.ts`
  - `src/domain/calculations/units.ts`
- Validering: `src/domain/validation/forms.ts`

---

## Seed-data som folger med

Ved forste oppstart seedes blant annet:

- demo-bruker + profil/settings/goals/units
- ovelsesbibliotek
- matbibliotek
- rutine med set-templates
- historiske treningsokter
- kroppsvekt-logg
- saved meal + recipe
- dagbokinnslag + vannlogg

---

## Prosjektstruktur

```text
src/
  components/        # gjenbrukbare UI-komponenter
  data/
    db/              # sqlite init/schema/ids
    repositories/    # all data-tilgang per domene
    seed/            # demo-seeding
    sync/            # sync-queue + supabase bridge
  domain/
    calculations/    # pure functions for beregninger
    validation/      # zod schemas
    models.ts        # typed domene-modeller
  features/
    auth/
    home/
    workouts/
    nutrition/
    progress/
    profile/
  hooks/             # react-query hooks
  navigation/        # root stack + tabs + typer
  services/          # auth + food provider abstractions
  stores/            # zustand store
  theme/             # farger/tema
```

---

## Kom i gang (lokalt)

### Krav

- Node.js + npm
- Xcode (for iOS)
- Android Studio (for Android)

### Installasjon

```bash
npm install
```

### Miljovariabler

Kopier `.env.example` til `.env` og fyll inn:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Hvis disse mangler, kjores appen i lokal demo-modus.

### Kjor appen

```bash
npm run start
npm run ios
npm run android
npm run web
```

### Ny iOS native project (ved behov)

```bash
npm run prebuild:ios
open ios/FormFuel.xcodeproj
```

---

## NPM-scripts

- `npm run start` - Expo dev server
- `npm run ios` - bygg/kjor iOS
- `npm run android` - bygg/kjor Android
- `npm run web` - web preview
- `npm run prebuild:ios` - generer iOS native prosjekt
- `npm run typecheck` - TypeScript noEmit
- `npm run test` - Jest tester

---

## Testing

Tester finnes i:

- `__tests__/workout.test.ts`
- `__tests__/nutrition.test.ts`

Disse dekker blant annet:

- volumkalkulasjon
- estimert 1RM
- PR-detektering
- summering av nutrition totals
- adherence/remaining macros

---

## Kjente begrensninger / TODO

- Barcode scanner er arkitekturmessig pa plass, men faktisk provider-oppslag er ikke konfigurert.
- Programredigering og template-creator i workout er forelopig knyttet til placeholders.
- Export/Delete data i profile er placeholders for neste backend-slice.
- Ingen omfattende repository-integrasjonstester enda (kun utvalgte domain-kalkulasjonstester).

Ekstra ideer finnes i: `To be added.md`.

---

## Endringslogg

- 2026-04-24: Opprettet full `README.md` med komplett appoversikt, funksjonsstatus, arkitektur, setup, sync-beskrivelse, teststatus og vedlikeholdsregel for videre oppdateringer.
