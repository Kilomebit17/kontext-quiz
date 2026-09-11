import { useTranslation } from 'react-i18next'
import { detectMedia, youTubeEmbedUrl } from '@/lib/youtube'
import { cn } from '@/lib/cn'

interface MediaProps {
  url: string | null | undefined
  className?: string
  /** Autoplay YouTube (host screen). */
  autoplay?: boolean
}

/** Image or privacy-enhanced YouTube embed. Renders nothing for empty URLs. */
export function Media({ url, className, autoplay = false }: MediaProps) {
  const { t } = useTranslation()
  const media = detectMedia(url)
  if (media.kind === 'none' || !url) return null
  if (media.kind === 'youtube' && media.id) {
    return (
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-2xl bg-black',
          className,
        )}
      >
        <iframe
          src={`${youTubeEmbedUrl(media.id)}${autoplay ? '&autoplay=1&mute=0' : ''}`}
          title={t('editor.mediaYoutube')}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn('max-h-full w-full rounded-2xl object-contain', className)}
    />
  )
}
