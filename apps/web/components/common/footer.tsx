import { t } from '@/lib/i18n';

export function Footer() {
  return (
    <footer
      className="mt-16 border-t border-[color:var(--color-border-subtle)] py-6"
      role="contentinfo"
    >
      <div className="mx-auto flex w-full max-w-[1536px] flex-col gap-1 px-4 text-xs text-[color:var(--color-fg-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{t('footer.copyright')}</p>
        <p>{t('footer.note')}</p>
      </div>
    </footer>
  );
}
