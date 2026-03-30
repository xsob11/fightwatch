# FightWatch

Przeglądarka zawodów sportów walki zoptymalizowana pod telefon, 
stworzona na potrzeby śledzenia walk na żywo podczas zawodów.

## Podstawa projektu

Aplikacja powstała na bazie open-source projektu 
[MartialMatch](https://github.com/andruwik777/martialmatch) 
autorstwa **andruwik777**, który udostępnia dane z martialmatch.com 
poprzez Cloudflare Worker proxy.

## Co zostało dodane

- **Szata graficzna** — własny design: ciemny motyw, 
  grupowanie zawodów po miesiącach, miniaturki z nakładką daty
- **System alertów 30 i 5 minut** przed walką wybranego zawodnika:
  - Powiadomienie systemowe (działa gdy ekran zgaszony)
  - Głośny sygnał dźwiękowy (słyszalny na hali sportowej)
  - Wibracja telefonu

## Technologie

Statyczny HTML/CSS/JS · GitHub Pages · Cloudflare Workers


# FightWatch

A mobile-optimized martial arts competition browser built for 
live fight tracking at sports events.

## Based on

This project is built on top of the open-source 
[MartialMatch](https://github.com/andruwik777/martialmatch) 
project by **andruwik777**, which provides data from martialmatch.com 
via a Cloudflare Worker proxy.

## What was added

- **Custom UI design** — dark theme, events grouped by month, 
  event thumbnails with date overlay
- **30 and 5 minute alert system** before a tracked athlete's fight:
  - System push notification (works with screen off)
  - Loud audio alert (audible in a noisy sports hall)
  - Phone vibration
  - In-app toast message
- Fighter filter saved in URL 
  (shareable link — others see the same fighters)

## Tech stack

Static HTML/CSS/JS · GitHub Pages · Cloudflare Workers
