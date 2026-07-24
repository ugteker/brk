# Personality Overlay – Design-Entscheidung

Stand: 2026-07-24

## Ziel

Agenten sollen einen einheitlichen Zweck haben (definiert durch Name, System-Prompt, Icon),
aber der Kommunikationsstil soll benutzerdefiniert anpassbar sein – ohne die
Identität des Agenten zu verändern.

## Konzept

Ein `personality`-Overlay legt fest, wie ein Agent kommuniziert, nicht was er tut.

Drei Ausprägungen:

| Wert | Label (DE) | Label (EN) | Bedeutung |
|---|---|---|---|
| `direct` | Direkt | Direct | Klar, knapp, auf den Punkt – kein Drum-herum-Reden |
| `balanced` | Ausgewogen | Balanced | Sachlich und zugänglich – Standard für die meisten Kontexte |
| `empathetic` | Einfühlsam | Empathetic | Wärmend, verständnisvoll, achtsam im Ton |

## Geltungsbereich

### Global (Account-Einstellungen)

- Jeder Account hat einen globalen Personality-Default (`balanced` bei Neuanlage).
- Einstellbar in den Account-/Profil-Einstellungen.
- Gilt für alle Agenten, die keinen Per-Agent-Override haben.

### Per Agent (Override)

- Jeder Agent kann den globalen Default mit einem eigenen Wert überschreiben.
- Kuratierte Seed-Agenten tragen einen `recommendedPersonality`-Hint, der als Default
  für den Override vorbelegt wird.
- Der Override ist jederzeit vom User änderbar.

## Wo wird es gesetzt?

### Kuratierte Seed-Agenten

- `recommendedPersonality` ist im Catalog-Bundle je Agent editorial vorgegeben.
- Im Agent-Detail-Drawer ist ein Dropdown sichtbar:
  `Kommunikationsstil: [Direkt / Ausgewogen / Einfühlsam]`
- Änderungen speichern sich in `UserLibraryAgent.personalityOverride`.

### User-erstellte Agenten (AI-Kurator)

- Der Kurator inferiert `recommendedPersonality` aus dem Kontext und schlägt ihn im
  **Bestätigungs-Screen** vor – als editierbares Feld neben Name und Zweck.
- Kein Extra-Schritt im Kurations-Flow, keine zusätzliche Frage.
- Beispiel Confirmation-Screen:

  ```
  ✎ Name           [Mathe-Tutor]
  ✎ Zweck          [Erklärt mathematische Konzepte Schritt für Schritt...]
  ✎ Kommunikation  [● Direkt  ○ Ausgewogen  ○ Einfühlsam]
  ```

- Gespeichert als `AgentPromptVersion.recommendedPersonality`.

## Technische Umsetzung (Übersicht)

| Layer | Änderung |
|---|---|
| Catalog-Bundle | Neues Feld `recommendedPersonality` pro Agent-Eintrag |
| Prisma `AgentPromptVersion` | Neues Feld `recommendedPersonality` (nullable, String) |
| Prisma `UserLibraryAgent` | Neues Feld `personalityOverride` (nullable, String) |
| Prisma `User` | Neues Feld `defaultPersonality` (String, Default `balanced`) |
| Catalog Validator | Prüft `recommendedPersonality` auf erlaubte Werte |
| Agent-Detail-Drawer | Dropdown zeigt Override, fällt auf User-Global-Default zurück |
| AI-Kurator (Confirmation) | Zeigt + speichert `recommendedPersonality` als Feld |
| System-Prompt-Injection | Overlay-Text wird zur Laufzeit an den System-Prompt angehängt |

## System-Prompt-Injection (Laufzeit)

Der Personality-Overlay-Text wird beim Run **dynamisch an den System-Prompt angehängt**
und verändert den immutablen Prompt-Snapshot nicht.

Beispiele:

```
direct:    "\n\nCommunicate concisely and directly. Skip preambles and filler phrases."
balanced:  ""  (kein Anhang – Balanced ist der neutrale Basisstil)
empathetic:"\n\nCommunicate warmly and with care. Acknowledge feelings before advice."
```

## Nicht in Scope (V1)

- Keine Freitext-Personality (nur 3 Werte)
- Kein per-Source-Override
- Kein temporäres Session-Override (Overlay gilt dauerhaft pro Agent)
- Character-Type bleibt im Schema für Catalog-Matching, ist aber nicht mehr User-facing
