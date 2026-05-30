import { useState } from "react";
import { Card } from "../Card.tsx";
import { icons } from "../icons.tsx";
import { initialNotes, type Note } from "../../data/mock.ts";

// Заметки · быстрый ввод — мок. Добавление работает в локальном state;
// персистенс (бэкенд-модель Note) — TODO будущей фазы.
export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [val, setVal] = useState("");

  const submit = () => {
    const text = val.trim();
    if (!text) return;
    setNotes((ns) => [{ text, time: "сейчас" }, ...ns]);
    setVal("");
  };

  return (
    <Card icon="note" title="Заметки · быстрый ввод" className="grow">
      <div className="note-input" style={{ marginBottom: 14 }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="$ записать мысль…"
        />
        <button className="icon-btn" onClick={submit} aria-label="Добавить"><icons.plus /></button>
      </div>
      <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
        {notes.map((n, i) => (
          <div key={i} className="note">
            {n.text}
            <span className="note-time">{n.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
