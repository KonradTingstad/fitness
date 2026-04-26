# FormFuel iOS Simulator Quickstart

Sist verifisert: 2026-04-26

## Må være riktig først

`/Users/konrad/Documents/Playground/Fitness/ios/.xcode.env.local` må peke på en fungerende Node:

```sh
export NODE_BINARY=/opt/homebrew/bin/node
```

Hvis den peker på en gammel Cellar-path (f.eks. `.../Cellar/node/...`), vil iOS-build feile i Hermes/RNDeps script phases.

## Standard oppstart (enkel)

1. Terminal 1: start Metro

```sh
cd /Users/konrad/Documents/Playground/Fitness
npm run start -- --dev-client --host localhost
```

Vent til du ser:

```txt
Metro waiting on http://localhost:8081
```

2. Terminal 2: bygg og launch iOS app

```sh
cd /Users/konrad/Documents/Playground/Fitness
npx expo run:ios --device "iPhone 17"
```

## Hvis du får rød skjerm: "Could not connect to development server"

1. Sjekk at Metro faktisk lytter på 8081:

```sh
lsof -i tcp:8081 -sTCP:LISTEN -n -P
```

2. Hvis Metro kjører, reload appen (`Cmd+R` i Simulator, eller trykk `Reload` på red screen).

3. Hvis `expo start` krasjer med `Cannot find module 'wonka'` eller lignende:

```sh
cd /Users/konrad/Documents/Playground/Fitness
rm -rf node_modules package-lock.json
npm install
cd ios && pod install && cd ..
```

Start deretter Metro + app på nytt med stegene over.

## Nøyaktig flyt som ble brukt i denne fixen

1. Fikset `NODE_BINARY` i `.xcode.env.local`.
2. Kjørte ren reinstall av dependencies (`node_modules` + `package-lock.json` + `npm install`).
3. Kjørte `pod install` i `ios`.
4. Startet app-binary i simulator.
5. Startet Metro (`npm run start -- --dev-client --host localhost`).
6. Reloadet appen når Metro var oppe.
