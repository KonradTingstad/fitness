# FormFuel Product And Technical Plan

## 1. Product Requirements

FormFuel is an iPhone-first fitness app that combines fast strength training logs with a diary-led nutrition tracker. The MVP must support local-first workout logging, routine templates, set history, rest timers, food search, custom foods, saved meals, recipes, calorie and macro targets, water tracking, progress charts, settings, and a Supabase-ready sync boundary.

The product is designed around three daily questions:

- What is my training and nutrition status today?
- What is the next useful action?
- Are my habits producing measurable progress?

Core MVP screens:

- Home dashboard with calories, macros, water, workout status, quick actions, adherence, and contextual insight.
- Workouts with routines, active workout continuation, history, and live logging.
- Nutrition diary with meal sections, search, custom foods, saved meals, recipes, barcode placeholder, water, and date navigation.
- Progress with training volume, frequency, body weight, macro, protein, and calorie adherence trends.
- Profile and settings with goals, units, sync state, export/delete affordances, and provider configuration placeholders.

## 2. Architecture And Stack

### Frontend

- React Native + Expo + TypeScript.
- React Navigation for a bottom-tab app plus stack-based detail flows. It is explicit, mature, and well-suited to an app with tab roots and modal/detail screens.
- `react-native-gifted-charts` for mobile-friendly charts.

### State

- Zustand for fast local UI and session state because logging interactions are high-frequency and mostly client-owned. It keeps live workout and auth/onboarding state simple without reducer ceremony.
- TanStack Query for repository reads, cache invalidation, background refresh, and future remote query orchestration.

### Persistence

- Expo SQLite as the local source of truth for core logs.
- Repository layer hides SQL details from screens.
- Stable UUIDs for entities that sync.
- Audit fields, soft delete fields, sync status, and version columns on syncable tables.

### Backend Boundary

- Supabase Auth, Postgres, Storage, and Edge Functions are the intended remote system.
- The current MVP includes a Supabase client and sync queue/service boundaries. It runs with local demo auth if Supabase environment values are not configured.

### Validation And Tests

- Zod validates write payloads and form data.
- Calculation utilities are pure functions with Jest tests.
- Integration tests should next cover active workout logging and diary entry creation through repositories.

## 3. Database And Local Data Model

See [DATA_SCHEMA.md](./DATA_SCHEMA.md) for entity-level schema, indexes, ownership, source-of-truth, and sync behavior.

## 4. Navigation And Screen Map

Root:

- Auth stack: sign in, onboarding.
- Main app: bottom tabs.

Tabs:

- Home
- Workouts
- Nutrition
- Progress
- Profile

Workout stack:

- Workout dashboard
- Live workout
- Workout summary
- Exercise history

Nutrition stack:

- Diary
- Food search
- Custom food
- Saved meals
- Recipe builder
- Barcode scanner placeholder

## 5. Key User Flows

Start a workout:

1. Open Workouts.
2. Tap a routine or start empty.
3. Session is inserted locally with workout/exercise/set UUIDs.
4. Live screen opens immediately.
5. User edits weight/reps and completes sets.
6. Completion writes instantly to SQLite and enqueues sync.
7. Rest timer starts locally.
8. Finish screen summarizes duration, sets, reps, volume, and PRs.

Log food:

1. Open Nutrition or use Home quick action.
2. Choose a meal slot.
3. Search foods, pick recent/favorite/custom item, or use quick add.
4. Entry writes locally to the selected local diary day.
5. Diary totals and Home dashboard update through query invalidation.

Create custom food:

1. Open custom food form.
2. Validate required nutrition fields with Zod.
3. Insert into `food_items` with `is_custom=1`, user ownership, and source `custom`.
4. Item becomes available offline and in search.

## 6. Sync And Offline Strategy

- Core writes always go to SQLite first.
- Each syncable write inserts a row into `sync_queue` with entity type, entity id, operation, payload, idempotency key, and retry metadata.
- Sync service checks connectivity with Expo Network and can push queued operations to Supabase Edge Functions.
- Remote writes should be idempotent by stable UUID and idempotency key.
- Simple profile/settings conflicts use last-write-wins by `updated_at`.
- Workout sessions merge by stable workout, exercise block, and set UUIDs. Completed sets are never dropped during conflict resolution.
- Diary entries merge by UUID. Duplicate food logs are prevented by local UUID primary keys plus remote upsert keys.

## 7. Project Structure

Feature code lives under `src/features`, shared UI under `src/components`, data access under `src/data`, domain models/calculations under `src/domain`, and navigation under `src/navigation`.

## 8. MVP Implementation Notes

The MVP implements the full screen map with local persistence and sample data. Supabase credentials are optional for local simulator work. The barcode scanner screen is intentionally provider-shaped: the physical scanner UI and provider lookup can be turned on once a barcode provider contract is selected.

## 9. Seed Data

Seed data includes:

- Demo local user/profile/settings.
- Exercise library.
- Food database subset.
- One routine template.
- Recent workout and body weight history for progress charts.
- Saved meal and recipe examples.

## 10. Setup

Install and run:

```sh
npm install
npm run ios
```

Generate the native iOS project:

```sh
npm run prebuild:ios
open ios/FormFuel.xcodeproj
```

For a full native build outside Expo Go, install CocoaPods and run `pod install` in `ios/`.

## 11. Next-Step Improvements

- Wire Supabase Edge Functions for real sync operations.
- Add real barcode provider integration.
- Add repository integration tests with an in-memory or temp SQLite database.
- Add HealthKit and Health Connect import/export.
- Add CSV export/delete account implementation.
- Add routine folder/tags and richer custom exercise editing.
