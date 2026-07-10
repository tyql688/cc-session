import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/index";
import { SHORTCUT_MANIFEST } from "@/app/shortcutManifest";

export function KeyboardOverlay(props: { show: boolean; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <Dialog
      open={props.show}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("keyboard.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {SHORTCUT_MANIFEST.map((cat) => (
            <div key={cat.categoryKey}>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t(cat.categoryKey)}
              </div>
              {cat.items.map((item, i) => (
                <div className="flex items-center justify-between gap-4 py-1" key={i}>
                  <span className="text-sm">{t(item.descKey) || item.descKey}</span>
                  <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
