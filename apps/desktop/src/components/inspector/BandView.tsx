import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { parseEigenval, type BandData } from "@/lib/bands";
import { useT } from "@/lib/i18n";

/**
 * Materials band-structure viewer (P1-3): plots each band's energy across the
 * k-point path from a VASP EIGENVAL file — the electronic-structure companion
 * to the DOS viewer. Spin-up and spin-down bands are drawn in two colors.
 * Offline, from the file alone; uses the app chart palette.
 */
export function BandView({ filename, bytes }: { filename: string; bytes: ArrayBuffer }) {
  const t = useT();
  const parsed = useMemo<{ data: BandData | null; error: string | null }>(() => {
    try {
      return { data: parseEigenval(new TextDecoder().decode(bytes)), error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [bytes]);

  const [hover, setHover] = useState<{ k: number; e: number } | null>(null);

  if (parsed.error || !parsed.data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-sm items-start gap-2 rounded-card border border-border bg-surface p-4 text-sm text-muted">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          <span>{t("Could not read this EIGENVAL —")} {parsed.error ?? t("unknown format")}.</span>
        </div>
      </div>
    );
  }

  const d = parsed.data;
  const W = 700;
  const H = 360;
  const pad = { l: 56, r: 16, t: 16, b: 40 };
  const eMin = d.eMin;
  const eMax = d.eMax;
  const eSpan = eMax - eMin || 1;
  const kMax = Math.max(1, d.nkpts - 1);
  const xAt = (k: number) => pad.l + (k / kMax) * (W - pad.l - pad.r);
  const yAt = (e: number) => H - pad.b - ((e - eMin) / eSpan) * (H - pad.t - pad.b);

  const pathFor = (band: number[]) =>
    band.map((e, k) => `${k === 0 ? "M" : "L"}${xAt(k).toFixed(1)},${yAt(e).toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const k = Math.round(((x - pad.l) / (W - pad.l - pad.r)) * kMax);
    const energy = eMin + ((H - pad.b - y) / (H - pad.t - pad.b)) * eSpan;
    setHover(k >= 0 && k <= kMax ? { k, e: energy } : null);
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
          {filename} · {t("bands")} · {d.nbands} {t("bands")} × {d.nkpts} {t("k-points")}
          {d.spin ? ` · ${t("spin-polarized")}` : ""}
        </span>
        {d.spin && (
          <span className="flex items-center gap-2 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm" style={{ background: "var(--series-1)" }} /> {t("up")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-3 rounded-sm" style={{ background: "var(--series-6)" }} /> {t("down")}
            </span>
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto max-h-full w-full max-w-[780px]"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* energy gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const e = eMin + f * eSpan;
            const y = yAt(e);
            return (
              <g key={f}>
                <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" className="text-border" strokeWidth={1} />
                <text x={pad.l - 6} y={y + 3} textAnchor="end" className="fill-muted font-mono text-[10px]">
                  {e.toFixed(1)}
                </text>
              </g>
            );
          })}
          {/* bands */}
          {d.bands.map((band, b) => (
            <path key={`u${b}`} d={pathFor(band)} fill="none" stroke="var(--series-1)" strokeWidth={1} strokeOpacity={0.85} />
          ))}
          {d.bandsDown?.map((band, b) => (
            <path key={`d${b}`} d={pathFor(band)} fill="none" stroke="var(--series-6)" strokeWidth={1} strokeOpacity={0.8} />
          ))}
          {hover && (
            <line x1={xAt(hover.k)} y1={pad.t} x2={xAt(hover.k)} y2={H - pad.b} stroke="currentColor" className="text-muted" strokeWidth={0.6} strokeDasharray="2 2" />
          )}
          <text x={W / 2} y={H - 4} textAnchor="middle" className="fill-muted font-mono text-[10px]">
            {t("k-point index")} (0…{d.nkpts - 1})
          </text>
          <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} className="fill-muted font-mono text-[10px]">
            {t("Energy")} (eV)
          </text>
        </svg>
      </div>

      <div className="border-t border-border px-3 py-2 text-right font-mono text-[11px] text-muted">
        {hover ? (
          <>k = {hover.k} · E ≈ {hover.e.toFixed(2)} eV</>
        ) : (
          <span className="text-muted/50">{t("hover to read k-point & energy")}</span>
        )}
      </div>
    </div>
  );
}
