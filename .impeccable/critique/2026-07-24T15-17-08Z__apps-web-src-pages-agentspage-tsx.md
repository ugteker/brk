---
target: Bibliothek und Agentenauswahl
total_score: 24
p0_count: 0
p1_count: 1
timestamp: 2026-07-24T15-17-08Z
slug: apps-web-src-pages-agentspage-tsx
---
# Critique: Bibliothek und Agentenauswahl

## Design Health Score

| # | Heuristik | Score | Kernproblem |
|---|---|---:|---|
| 1 | Sichtbarkeit des Systemstatus | 3 | Loading, Retry und Erfolg sind sichtbar; der aktuelle Schritt ist sprachlich nicht immer eindeutig. |
| 2 | System / reale Welt | 2 | "Zusammenfassen" beschreibt nicht die Entscheidung, einen Agenten zu verbinden. |
| 3 | Kontrolle und Freiheit | 3 | Abbrechen und Details sind vorhanden; der Weg verteilt sich aber auf mehrere parallele Muster. |
| 4 | Konsistenz und Standards | 2 | `listen.*`, `agentSelection.*`, Agent, Folgen und Playbook benennen denselben Flow unterschiedlich. |
| 5 | Fehlervermeidung | 2 | Bestätigungen existieren, aber missverständliche Verben fördern falsche Erwartungen. |
| 6 | Wiedererkennen statt Erinnern | 3 | Match-Gründe und Drawer helfen; der Quellkontext ist nicht im gesamten Flow gleich präsent. |
| 7 | Flexibilität und Effizienz | 2 | Seitenweise sechs Treffer ohne Suche oder Filter erschweren schnellen Vergleich. |
| 8 | Ästhetik und Minimalismus | 2 | Zu viele gleichgewichtete Karten, Rahmen, Tags und CTAs konkurrieren. |
| 9 | Fehlerbehandlung | 3 | Retry ist vorhanden; Fehlermeldungen sind noch technisch und wenig kontextbezogen. |
| 10 | Hilfe und Dokumentation | 2 | Der Detail-Drawer erklärt gut; die Einstiegsansicht erklärt Auswahl und Folgen zu wenig. |
| **Gesamt** |  | **24/40** | **Solide Basis, aber inkonsistente Journey** |

## Anti-Patterns Verdict

**LLM-Bewertung:** Nicht offensichtlich KI-generiert, aber stellenweise templateartig. Wiederholte Kartenraster, Ghost-Cards, Tags und violett/blaue Akzente erzeugen Gleichförmigkeit. Die stärkere Schwäche ist jedoch nicht Stil, sondern Produktgrammatik: Die neue kuratierte Agentenauswahl sitzt in einem alten "Zusammenfassen"-Wizard.

**Deterministischer Scan:** 0 Findings in den geprüften Library- und Agent-Selection-Komponenten. Das bestätigt, dass keine formalen Slop-Regeln verletzt werden; es widerlegt nicht die semantischen und hierarchischen Probleme.

**Visual Overlay:** Nicht verfügbar, da in dieser Sitzung keine Browser-Automation beziehungsweise mutable Script-Injektion bereitsteht. Es wird daher kein visueller Browser-Overlay behauptet.

## Gesamteindruck

Die Bibliothek vermittelt mit echten Covers und Seed-Inhalten sofort Wert. Die Journey verliert aber genau beim wichtigsten Übergang an Klarheit: Nutzer wollen entscheiden, **welcher Agent dieser Quelle folgen soll**, während Modal-Titel und Hilfetexte weiterhin von "Zusammenfassen" sprechen. Die größte Chance ist ein einheitliches Modell aus Quelle, Agent und Ergebnis.

## Was funktioniert

1. Der Agenten-Detail-Drawer erklärt Aufgabe, Match-Gründe, Persona, Sprache und Themen und ist der vertrauenswürdigste Moment im Flow.
2. Agenten lassen sich direkt im Kontext einer Source-Card hinzufügen; der Nutzer muss die Quelle nicht erneut suchen.
3. Loading-, Retry- und Erfolgszustände sind vorhanden und verhindern blindes Warten.

## Prioritätsprobleme

### [P1] Der Flow benennt die falsche Aufgabe

**Warum:** "Zusammenfassen: XYZ" reduziert alle Agenten auf Summarizer und widerspricht spezialisierten Rollen wie Tutor, Faktenprüfer oder Entscheidungs-Coach. Nutzer können nicht sicher vorhersagen, was die Auswahl bewirkt.

**Fix:** Titel "Agent für {{title}} auswählen"; Unterzeile "Wähle, welcher Agent neue Inhalte dieser Quelle verfolgen und für dich auswerten soll." Zustände: "Agent folgt", "Agent entfernen", "Weitere Agenten hinzufügen". "Zusammenfassen" nur verwenden, wenn tatsächlich ein einzelner Summarize-Run gemeint ist.

**Suggested command:** `/impeccable clarify`

### [P2] Zu viele Aktionen haben gleiches visuelles Gewicht

**Warum:** Source öffnen, Reports öffnen, Agent hinzufügen, Agent entfernen, Starter speichern, eigene Quelle erstellen, Details, Agent verwenden und Variante bauen konkurrieren gleichzeitig.

**Fix:** Pro Ebene eine Primäraktion. Library-Card: Karte öffnen als primäre Navigation, Agent-Strip als kompakte Sekundärfunktion. Agent Selection: "Agent verwenden" primär; Details als sekundärer Link; Varianten und Updates ausschließlich im Drawer.

**Suggested command:** `/impeccable distill`

### [P2] Best Matches sind nicht gut vergleichbar

**Warum:** Sechs Treffer pro Seite, nur zwei Match-Tags und keine Suche oder Filter zwingen Nutzer zum Öffnen mehrerer Drawer und zum Erinnern vorheriger Agenten.

**Fix:** Zweck als kurze Zweizeilenbeschreibung direkt auf der Karte zeigen; Match-Grund als sekundäre Evidenz. Suche und einfache Filter nach Persona/Thema ergänzen, bevor weitere Pagination-Mechanik ausgebaut wird.

**Suggested command:** `/impeccable shape`

### [P2] Ganze Source-Cards sind Maus-, aber keine klaren Tastaturziele

**Warum:** Die Card reagiert auf `onClick`, besitzt aber keine vollständige Link-/Button-Semantik. Das schwächt Accessibility und erkennbare Interaktion.

**Fix:** Titel beziehungsweise Cover als echten Link ausführen oder die Card mit sauberer Keyboard-Semantik, Fokuszustand und Enter/Space-Unterstützung versehen.

**Suggested command:** `/impeccable audit`

### [P3] Das visuelle Vokabular ist unnötig uneinheitlich

**Warum:** Sky-blauer runder Agent-Plus-Button, violetter Primary-Button "Zur Bibliothek hinzufügen" und blaue/violette Ghost-Card behandeln verwandte Add-Aktionen unterschiedlich.

**Fix:** Gemeinsames Add-System: Plus-Icon und violetter Aktionsfarbton; gespeicherte Starter als ruhiger Outline-CTA, Source-Erstellung als Ghost-Card, Agent-Erstellung als beschriftete Zelle im Agenten-Strip.

**Suggested command:** `/impeccable polish`

## Cognitive Load

Fehlschläge: Single Focus, Minimal Choices und konsistente Gruppierung. Die Agentenauswahl bietet gleichzeitig eigene Agenten, Ghost-Card, Best Matches, Pagination, Details und Verwenden. Die Bibliothekskarte kombiniert Navigation, Reportstatus und Agentenverwaltung. Ergebnis: **moderate bis hohe extrinsische Last**.

## Emotional Journey

- **Start:** Seed-Covers und nicht-leere Bibliothek erzeugen Zuversicht.
- **Übergang:** "Zusammenfassen" und der große Wizard brechen das mentale Modell.
- **Auswahl:** Kuratierte Namen wecken Interesse, aber knappe Karten erschweren Vertrauen.
- **Details:** Der Drawer stellt Vertrauen wieder her.
- **Abschluss:** Erfolgsfeedback ist gut, sollte aber zur ursprünglichen View und Sprache passen.

## Persona Red Flags

**Erstnutzer:** Versteht nicht, ob "Zusammenfassen" einen einmaligen Bericht startet oder dauerhaft einen Agenten verbindet. Die Begriffe Agent, Folgen und Playbook sind nicht sauber erklärt.

**Power User:** Muss durch paginierte Treffer und Drawer klicken; Suche, Filter und schneller Vergleich fehlen.

**Research Professional:** "Beste Treffer" wirkt ohne sichtbare Ranking-Grundlage zu behauptend. Zweck und Match-Evidenz sollten direkt vergleichbar sein.

## Kleine Beobachtungen

- "Kuratiert" und "Deins" sind hilfreiche Ownership-Signale, aber nicht die wichtigste Information auf der Karte.
- Die "Starter-Auswahl"-Badge plus "Für dich kuratiert"-Box wiederholt dieselbe Aussage.
- Der Empty State bei `source === null` nutzt fälschlich dieselbe Copy wie "keine Treffer".
- "Curate with AI" beziehungsweise "Eigenen Agent bauen" sollte über alle Einstiege hinweg identisch heißen.
- Die besprochene feste 72-px-Agentenzelle mit zwei Titelzeilen löst den Überlappungsfehler und stärkt das Strip-Muster.

## Fragen

1. Ist die Kernaktion "Agent folgt künftig neuen Inhalten" oder "Agent erstellt jetzt einmalig einen Bericht"? Die Oberfläche mischt derzeit beides.
2. Sollen Best Matches als redaktionelle Empfehlung oder als algorithmische Rangliste verstanden werden?
3. Muss die Bibliothekskarte Reports und Agentenverwaltung vollständig enthalten, oder darf die Detailansicht einen Teil davon übernehmen?
