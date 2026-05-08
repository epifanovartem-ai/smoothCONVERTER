import { forwardRef } from "react";

export type PageData = {
  title: string;
  subtitle: string;
  level: string;
  commence: string;
  steps: Array<{
    step: string;
    footPosition: string;
    dancePosition: string;
    alignment: string;
    turn: string;
    cbm: string;
    riseFall: string;
    fw: string;
    count: string;
    sway: string;
  }>;
  summary: Array<{ label: string; desc: string; rowSpan: number; startStep: number }>;
  leadNotes: string;
  notes: string[];
};

const columns = [
  { key: "step", label: "Шаг", width: "w-12" },
  { key: "footPosition", label: "Позиция ноги", width: "w-44" },
  { key: "dancePosition", label: "Танц. позиция", width: "w-32" },
  { key: "alignment", label: "Направление", width: "w-20" },
  { key: "turn", label: "Поворот", width: "w-16" },
  { key: "cbm", label: "ДКТ", width: "w-14" },
  { key: "riseFall", label: "Подъём и снижение", width: "w-44" },
  { key: "fw", label: "Работа стопы", width: "w-40" },
  { key: "count", label: "Счёт", width: "w-14" },
  { key: "sway", label: "Свей", width: "w-14" },
] as const;

const RenderedDanceTable = forwardRef<HTMLDivElement, { data: PageData }>(({ data }, ref) => {
  const summaryMap = new Map<number, { label: string; desc: string; rowSpan: number }>();
  data.summary?.forEach((s) => {
    summaryMap.set(s.startStep, { label: s.label, desc: s.desc, rowSpan: s.rowSpan });
  });

  const hasSummary = (data.summary?.length ?? 0) > 0;

  return (
    <div ref={ref} className="w-full bg-background p-6">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{data.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{data.subtitle}</p>
        </div>
        {data.level && (
          <span className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold uppercase tracking-wider">
            {data.level}
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">{data.commence}</p>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider first:rounded-tl-xl ${col.width}`}
                >
                  {col.label}
                </th>
              ))}
              {hasSummary && (
                <th className="px-3 py-3 text-left font-semibold text-xs uppercase tracking-wider rounded-tr-xl w-40">
                  Итого
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.steps.map((step, i) => {
              const stepNum = i + 1;
              const sum = summaryMap.get(stepNum);
              return (
                <tr
                  key={i}
                  className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-secondary/40"}`}
                >
                  {columns.map((col) => {
                    const value = step[col.key as keyof typeof step];
                    if (col.key === "count") {
                      const isSlow = value === "М";
                      return (
                        <td key={col.key} className="px-3 py-3">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${
                              isSlow
                                ? "bg-[hsl(var(--count-slow)/0.12)] text-[hsl(var(--count-slow))]"
                                : "bg-[hsl(var(--count-quick)/0.12)] text-[hsl(var(--count-quick))]"
                            }`}
                          >
                            {value}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "step") {
                      return (
                        <td key={col.key} className="px-3 py-3 font-bold text-primary">
                          {value}
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className="px-3 py-3 text-foreground align-top">
                        {value}
                      </td>
                    );
                  })}
                  {hasSummary && sum && (
                    <td rowSpan={sum.rowSpan} className="px-3 py-3 align-top border-l border-border">
                      <span className="font-bold text-primary">{sum.label}</span>
                      <br />
                      <span className="text-foreground">{sum.desc}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(data.leadNotes || data.notes?.length > 0) && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          {data.leadNotes && (
            <>
              <h3 className="font-semibold text-foreground mb-2">Ведущий:</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{data.leadNotes}</p>
            </>
          )}
          {data.notes?.length > 0 && (
            <>
              <h3 className="font-semibold text-foreground mt-4 mb-2">Примечания:</h3>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                {data.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
});

RenderedDanceTable.displayName = "RenderedDanceTable";
export default RenderedDanceTable;
