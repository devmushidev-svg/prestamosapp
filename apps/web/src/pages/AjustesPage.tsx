import { Check, Palette } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { PwaInstallCard } from "../components/PwaInstallCard";
import { OfflineControlCard } from "../components/OfflineControlCard";
import { Card } from "../components/ui";
import { PF_THEME_PRESETS, type PfThemeId } from "../theme/pfTheme";
import { usePfTheme } from "../theme/ThemeProvider";

/** Colores representativos de cada preset para la miniatura (deben reflejar index.css). */
const SWATCHES: Record<PfThemeId, { primary: string; surface: string; text: string; descripcion: string }> = {
  default: { primary: "#f97316", surface: "#f3f6f8", text: "#111827", descripcion: "El original: naranja de marca sobre fondo claro." },
  slate: { primary: "#64748b", surface: "#f7f8fb", text: "#0f172a", descripcion: "Sobrio y neutro, en grises azulados." },
  ocean: { primary: "#2494c7", surface: "#f5fbfe", text: "#0c1f2e", descripcion: "Frío y empresarial, azul oceánico." },
  dark: { primary: "#f97316", surface: "#0f172a", text: "#f1f5f9", descripcion: "Modo oscuro, ideal con poca luz." },
};

function ThemeOption({ id }: { id: PfThemeId }) {
  const { theme, setTheme } = usePfTheme();
  const preset = PF_THEME_PRESETS[id];
  const swatch = SWATCHES[id];
  const selected = theme === id;
  return (
    <button
      type="button"
      onClick={() => setTheme(id)}
      aria-pressed={selected}
      className={`group flex flex-col overflow-hidden rounded-2xl border text-left shadow-sm transition-all duration-200 touch-manipulation hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-primary ${
        selected ? "border-pf-primary ring-2 ring-pf-primary/35" : "border-pf-border-soft hover:border-pf-border-strong"
      }`}
    >
      {/* Miniatura del tema */}
      <div className="h-20 w-full p-3" style={{ backgroundColor: swatch.surface }} aria-hidden>
        <div className="flex h-full flex-col justify-between rounded-lg border border-black/5 bg-white/10 p-2 shadow-sm">
          <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: swatch.primary }} />
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full opacity-60" style={{ backgroundColor: swatch.text }} />
            <div className="h-1.5 w-1/2 rounded-full opacity-30" style={{ backgroundColor: swatch.text }} />
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-between gap-2 border-t border-pf-border-soft bg-pf-surface-elevated p-3">
        <div className="min-w-0">
          <p className="font-bold text-pf-text">{preset.label}</p>
          <p className="mt-0.5 text-xs leading-snug text-pf-muted">{swatch.descripcion}</p>
        </div>
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
            selected
              ? "border-transparent bg-pf-primary text-white"
              : "border-pf-border-strong bg-transparent text-transparent group-hover:border-pf-primary"
          }`}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      </div>
    </button>
  );
}

export function AjustesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-2 py-4 pf-safe-page md:px-4 md:py-6">
      <PageHero title="Configuraciones">
        <p className="pf-page-lead">Instalación, trabajo sin Internet y preferencias de este dispositivo.</p>
        <p className="pf-page-lead-muted">Complete los dos primeros pasos antes de salir a cobrar sin señal.</p>
      </PageHero>

      <PwaInstallCard />

      <OfflineControlCard />

      <Card className="p-5 md:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pf-primary-soft text-pf-primary-hover">
            <Palette className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 id="titulo-tema" className="font-extrabold text-pf-text">Tema de la interfaz</h2>
            <p className="text-xs text-pf-muted">El cambio se aplica al instante y se recuerda en este navegador.</p>
          </div>
        </div>

        <div role="group" aria-labelledby="titulo-tema" className="pf-stagger mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(PF_THEME_PRESETS) as PfThemeId[]).map((id) => (
            <ThemeOption key={id} id={id} />
          ))}
        </div>
      </Card>
    </div>
  );
}
