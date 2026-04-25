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
  - scroll-responsiv hero-header for kalorier (ikke card)
  - kollaps/parallax/fade-animasjon ved scroll
  - kompakt toppstatus i kollapset state (`consumed / target kcal`)
  - makroindikatorer (protein/carbs/fat) plassert i scroll-innholdet under hero, slik at de scroller sammen med resten av modulene
  - "Today plan" (start workout / view workout / view summary)
  - hydration med "Add 250 ml"
- Quick actions:
  - Start workout
  - Log meal

### 3) Workouts

`WorkoutDashboardScreen` har 4 faner:

- `Today`: dagens planlagte okt/forslag, rest day-state, ukesstatus, streak og progress overview
- `Program`: ukesplan + grupperte templates i 2-kolonne grid
- `History`: ukesoppsummering, kalender og fullforte okter med sammendrag
- `Exercises`: sok/filter, PR/last set-data, inngang til historikk

Program-fanen:

- viser `My groups` med lokale workout-grupper
- grupper kan foldes inn/ut og persisteres lokalt i AsyncStorage
- templates vises som kompakte kort i 2-kolonne grid
- hver gruppe har handlinger for rename, reorder, duplicate og delete

History-fanen:

- manedskalender markerer kun workout-dager med tynn gronn outline rundt datoen
- rest-dager og rest-legends vises ikke i manedsvisning
- workout-datoer kan trykkes for a apne `WorkoutSummary`
- `Month` kan ikke navigere fremover forbi navaerende maned
- kalenderen har `Month`, `Year` og `Multi-year` visning
- kalenderkortet holder fast hoyde nar man bytter mellom visningene
- `Year` og `Multi-year` ankrer seg til nyeste tilgjengelige periode uavhengig av valgt maned i `Month`
- `Year` viser mini-heatmaps i fast 3-kolonne grid, med eldre maneder oppover og nyeste manedsrekke nederst
- `Year` viser ikke rader etter raden som inneholder valgt/navaerende maned
- `Multi-year` viser kompakt aktivitetsoversikt i en intern scroll-liste med eldre ar oppover, nyeste ar nederst og manedsforkortelser
- kalenderbytte beholder forrige data mens neste periode hentes, og prefetcher naboperioder for a unnga venteskjerm

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

- `Diary`: dashboard-kort for kalorier/macros, separate maltidskort, log meal og barcode-ingang
- `Search`: sok/filter/chips, quick-add, recent searches
- `Meals`: strukturerte seksjoner for saved meals, favorites og recent meals med rikere kort, ingredient preview og macro-visualisering
- `Goals`: target-kort og progresjon pa kalorier/macros/vann

Diary-fanen:

- kalorimodulen er et dashboard-kort med stort kcal-tall, resterende kcal, arc-progress og macro-rad
- kalorimodulen fungerer som en hero-seksjon med stor semitransparent progress-ring, animert fill og `+kcal` feedback nar kalorier oker
- macro-raden bruker tre visuelle mini-kort for Protein, Carbs og Fat med fargekodet prosent, verdi, target og progressbar
- `Breakfast`, `Lunch`, `Dinner` og `Snacks` vises som separate ekspanderbare kort med ikon, kcal/items, siste loggede matvare, dagskalori-progress og inline food-rader
- maltidskortene har swipe right for quick-add av siste brukte matvare, swipe left for full add-food flow og repeat previous meal basert pa gardagens samme maltid
- `Log meal` er primar fullbredde-CTA, fulgt av egen barcode scanner-rad
- Nutrition-skjermene bruker felles gradientbakgrunn med subtil scroll-parallax, gradientkort uten harde borders og standardiserte CTA-knapper

`FoodSearchScreen`:

- sok i lokal matdatabase
- resultatene bruker storre matvarenavn, dempet metadata og fargekodede macro-chips for Protein, Carbs og Fat
- `+` i resultatlisten quick-adder til sist brukte maltid pa tap, mens long press apner valg av maltid og portion-input
- smart suggestions viser ofte loggede matvarer overst med labels som `Often eaten at breakfast`, basert pa gjentatt og nylig logging
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

- header + tidsfilter (`7D`, `30D`, `90D`, `1Y`, `All`)
- `Overview`-seksjon med 4 moduler som kan tilpasses av bruker via `Edit`
  - bruker kan legge til/fjerne stats (maks 4 aktive)
  - valg lagres per bruker i `progress_overview_modules`
- `Custom stats`-seksjon med datadrevne widget-kort
  - widgets hentes fra `progress_widgets`
  - hver widget kan redigeres/slettes
  - støtter body/nutrition/training/exercise-metrikker
- flyt for nye statistikker:
  - `+` -> `Add statistic` bottom sheet (kategori)
  - `Select statistic` skjerm
  - `Configure statistic` skjerm med preview + save

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

### Felles UI-shell

- `src/components/Screen.tsx` er standard wrapper for vanlige skjermer.
- `src/components/AppBackground.tsx` legger en felles gronn toppfade bak skjerminnholdet.
- Home har fortsatt en egen mer avansert hero-bakgrunn fordi den er en spesiallayout.

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

For iOS-simulator i denne appen bor native development build brukes:

```bash
npm run ios
```

`npm run start` starter Metro, men skal ikke brukes som Expo Go-flyt nar native moduler eller development build oppforsel skal verifiseres.

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
- History `Year` og `Multi-year` er forelopig oversiktsvisninger uten direkte drilldown per dag.
- Export/Delete data i profile er placeholders for neste backend-slice.
- Ingen omfattende repository-integrasjonstester enda (kun utvalgte domain-kalkulasjonstester).
- Drag & drop-rekkefolge for progress-widgets/overview-moduler er ikke implementert enda.

Ekstra ideer finnes i: `To be added.md`.

---

## Endringslogg

- 2026-04-24: Workouts er oppdatert med ny Today-layout/streak-logikk, grupperte Program-templates i 2-kolonne grid, fast hoyde pa History-kalenderen med Month/Year/Multi-year, intern scroll for Year/Multi-year, Year-grid med 3 kolonner og nyeste rekke nederst, Month-sperre mot fremtid, separat nyeste-anker for Year/Multi-year, manedslabels i Multi-year, cache/prefetch for kalenderbytte og felles gronn toppfade via `AppBackground`.
- 2026-04-24: Nutrition `Diary` er redesignet som en mer dynamisk dashboard-layout med kalorikort, arc-progress, macro-progress og separate maltidskort i Workouts-stil.
- 2026-04-25: Nutrition UI er polert med egen parallax-gradientbakgrunn, borderless gradientkort, mykere shadows, mer vertikal spacing og felles CTA-stil.
- 2026-04-25: Nutrition `Diary` kalorimodul er gjort om til hero med stor animert bakgrunnsring, sentrert kcal-visning og kortvarig `+kcal` feedback ved logging.
- 2026-04-25: Nutrition `Diary` macro-seksjonen er gjort mer visuell med tre fargekodede mini-kort for Protein, Carbs og Fat.
- 2026-04-25: Nutrition `Diary` maltidskortene er gjort ekspanderbare med siste loggede matvare, inline logged foods, fargeidentitet og dagskalori-progress per maltid.
- 2026-04-25: Nutrition `Diary` maltidskortene har faatt native swipe-actions for quick-add/full add-flow, haptic feedback og repeat previous meal fra gardagens entries.
- 2026-04-25: Nutrition food search-resultater er gjort mer skannbare med storre navn, roligere metadata og fargekodede macro-chips.
- 2026-04-25: Nutrition food search `+` har faatt quick-add til sist brukte maltid, long-press for maltid/portion og haptic/visual add-feedback.
- 2026-04-25: Nutrition Search har faatt smart suggestions for frequently logged foods med vanligste meal-slot-label basert pa diary-historikk.
- 2026-04-25: Nutrition `Meals` er strukturert i seksjonene Saved meals, Favorites og Recent meals med tydelige headers og View all der det passer.
- 2026-04-25: Nutrition `Meals`-kortene viser ingredient preview, tydeligere kcal-hierarki og fargekodede macro-bars/indikatorer.
- 2026-04-24: Oppdatert app-ikon til nytt FormFuel-ikon (assets: `icon.png`, `adaptive-icon.png`, `favicon.png`) basert pa levert designfil.
- 2026-04-24: Home hero er finjustert mot målbildet (bedre typografi/proposjoner i ring/seksjoner, topprad/streak/greeting), og macro-boksene er flyttet til scroll-innhold slik at de følger nedover med de andre kortene.
- 2026-04-24: Home er redesignet med animert hero-header for kalorier (gradientbakgrunn, progresjonsring, makro-pills, parallax/kollaps/fade) og kompakt collapsed-state ved scroll.
- 2026-04-24: Progress `Overview` er gjort bruker-tilpassbar (legg til/fjern stats), med ny `Edit overview` bottom sheet og persistering i `progress_overview_modules`.
- 2026-04-24: Progress er refaktorert til datadrevet widget-dashboard med `Add statistic`-flyt (kategori -> velg metrikk -> konfigurer -> lagre), nye progress-komponenter og persistens i `progress_widgets`.
- 2026-04-24: Opprettet full `README.md` med komplett appoversikt, funksjonsstatus, arkitektur, setup, sync-beskrivelse, teststatus og vedlikeholdsregel for videre oppdateringer.
