import { useTranslation } from 'react-i18next'
import { AVATAR_CHARACTERS, AVATAR_COLORS, parseAvatar } from '@kontext/shared'
import { AnimalAvatar } from './AnimalAvatar'
import { cn } from '@/lib/cn'

interface AvatarPickerProps {
  /** Currently selected avatar id (e.g. "navy-wink-3"); may be null/unknown. */
  value: string | null | undefined
  onChange: (avatar: string) => void
  size?: 'md' | 'lg'
  className?: string
}

/**
 * Grid of every character in the catalogue. The colour index of the current
 * avatar is preserved, so picking a character keeps the player's accent colour.
 */
export function AvatarPicker({ value, onChange, size = 'md', className }: AvatarPickerProps) {
  const { t } = useTranslation()
  const current = parseAvatar(value)
  const colorIndex = current?.colorIndex ?? 0
  return (
    <div
      role="radiogroup"
      aria-label={t('avatars.pickerLabel')}
      data-testid="avatar-picker"
      className={cn('grid grid-cols-5 gap-2 sm:grid-cols-6 sm:gap-3', className)}
    >
      {AVATAR_CHARACTERS.map((character) => {
        const id = `${character}-${colorIndex % AVATAR_COLORS.length}`
        const selected = current?.animal === character
        return (
          <button
            key={character}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`avatars.${character}`, {
              defaultValue: character.replace(/[-_]+/g, ' '),
            })}
            data-testid={`avatar-option-${character}`}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center justify-center rounded-lg p-0.5 transition-transform',
              'focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none',
              selected
                ? 'scale-105 ring-4 ring-amber'
                : 'opacity-80 hover:scale-105 hover:opacity-100',
            )}
          >
            <AnimalAvatar avatar={id} size={size === 'lg' ? 'lg' : 'md'} className="ring-0" />
          </button>
        )
      })}
    </div>
  )
}
