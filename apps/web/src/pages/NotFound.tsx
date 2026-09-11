import { useTranslation } from 'react-i18next'
import { Compass } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { ErrorScreen } from '@/components/ErrorScreen'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function NotFound() {
  const { t } = useTranslation()
  usePageTitle(t('titles.notFound'))
  return (
    <AppShell>
      <ErrorScreen
        icon={<Compass className="size-12" />}
        title={t('app.notFound')}
        text={t('app.notFoundHint')}
        actionLabel={t('app.home')}
        actionTo="/"
        testId="not-found"
      />
    </AppShell>
  )
}
