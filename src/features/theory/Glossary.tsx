import { useState } from "react";
import { Search } from "lucide-react";
import { Card, Input, SectionTitle } from "@/components/ui";
import { GLOSSARY, type Term } from "@/data/glossary";

const matches = (t: Term, q: string) => [t.term, ...(t.aka ?? []), t.text].some((s) => s.toLowerCase().includes(q));

/** The "Термины" tab: what a mode, a key, drop 2 and the rest mean, with a search on top. */
export function Glossary() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = GLOSSARY.map((g) => ({ ...g, terms: q ? g.terms.filter((t) => matches(t, q)) : g.terms })).filter((g) => g.terms.length);
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти термин: лад, drop 2, shell…" className="pl-10" />
      </div>
      {groups.map((g) => (
        <section key={g.group}>
          <SectionTitle>{g.group}</SectionTitle>
          <div className="space-y-2">
            {g.terms.map((t) => (
              <Card key={t.term} className="space-y-1.5">
                <h3 className="text-lg font-bold leading-tight">
                  {t.term}
                  {t.aka?.length ? <span className="ml-2 text-sm font-normal text-muted">{t.aka.join(", ")}</span> : null}
                </h3>
                <p className="text-sm leading-relaxed">{t.text}</p>
                {t.example && <p className="rounded-xl bg-surface-2/60 px-3 py-2 text-sm leading-relaxed text-muted">{t.example}</p>}
              </Card>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="px-1 pt-6 text-center text-sm text-muted">Ничего не нашлось</p>}
    </div>
  );
}
