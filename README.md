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
