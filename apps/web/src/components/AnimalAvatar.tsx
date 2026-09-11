import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AVATAR_IMAGE_EXT, parseAvatar } from '@kontext/shared'
import { cn } from '@/lib/cn'

interface AnimalAvatarProps {
  /** Avatar id such as "fox-2". Unknown/missing ids render a neutral placeholder. */
  avatar: string | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Extra accessible label, e.g. the nickname. */
  label?: string
}

const sizes = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-16',
  xl: 'size-24 md:size-32',
}

// Shared palette for the characters themselves (backgrounds come from AVATAR_COLORS).
const INK = '#141B33'
const WHITE = '#FFFFFF'
const BLUSH = '#FF8FA3'

/** Two eyes + small highlight, reused by most animals. */
function Eyes({ y = 34, dx = 9, r = 3.2 }: { y?: number; dx?: number; r?: number }) {
  return (
    <>
      <circle cx={32 - dx} cy={y} r={r} fill={INK} />
      <circle cx={32 + dx} cy={y} r={r} fill={INK} />
      <circle cx={32 - dx + 1.1} cy={y - 1.1} r={r * 0.3} fill={WHITE} />
      <circle cx={32 + dx + 1.1} cy={y - 1.1} r={r * 0.3} fill={WHITE} />
    </>
  )
}

function Blush({ y = 41, dx = 14 }: { y?: number; dx?: number }) {
  return (
    <>
      <ellipse cx={32 - dx} cy={y} rx="3.6" ry="2.2" fill={BLUSH} opacity="0.75" />
      <ellipse cx={32 + dx} cy={y} rx="3.6" ry="2.2" fill={BLUSH} opacity="0.75" />
    </>
  )
}

/** Built-in SVG fallbacks, used while no image set has been built (see scripts/build-avatars.mjs). */
const ANIMALS: Partial<Record<string, ReactNode>> = {
  cat: (
    <>
      <path d="M15 30 L14 12 L27 22 Z" fill="#F4A261" />
      <path d="M49 30 L50 12 L37 22 Z" fill="#F4A261" />
      <path d="M17.5 27 L17 16 L25.5 22.5 Z" fill={BLUSH} />
      <path d="M46.5 27 L47 16 L38.5 22.5 Z" fill={BLUSH} />
      <ellipse cx="32" cy="37" rx="19" ry="17" fill="#F4A261" />
      <Eyes />
      <path d="M30 42 L34 42 L32 45 Z" fill={INK} />
      <path
        d="M32 45 Q29 49 26 46 M32 45 Q35 49 38 46"
        stroke={INK}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M12 39 L23 41 M12 44 L23 43 M52 39 L41 41 M52 44 L41 43"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  fox: (
    <>
      <path d="M13 32 L11 10 L28 21 Z" fill="#E8722A" />
      <path d="M51 32 L53 10 L36 21 Z" fill="#E8722A" />
      <path d="M16 29 L15 15 L26 22.5 Z" fill={WHITE} />
      <path d="M48 29 L49 15 L38 22.5 Z" fill={WHITE} />
      <path d="M12 34 Q32 20 52 34 Q50 54 32 56 Q14 54 12 34 Z" fill="#E8722A" />
      <path d="M20 44 Q32 34 44 44 Q42 54 32 56 Q22 54 20 44 Z" fill={WHITE} />
      <Eyes y={36} dx={9} r={3} />
      <ellipse cx="32" cy="48" rx="3.2" ry="2.4" fill={INK} />
    </>
  ),
  panda: (
    <>
      <circle cx="17" cy="20" r="7.5" fill={INK} />
      <circle cx="47" cy="20" r="7.5" fill={INK} />
      <ellipse cx="32" cy="37" rx="20" ry="18" fill={WHITE} />
      <ellipse cx="23" cy="35" rx="6.5" ry="7.5" fill={INK} transform="rotate(-15 23 35)" />
      <ellipse cx="41" cy="35" rx="6.5" ry="7.5" fill={INK} transform="rotate(15 41 35)" />
      <circle cx="23.5" cy="35" r="2.4" fill={WHITE} />
      <circle cx="40.5" cy="35" r="2.4" fill={WHITE} />
      <circle cx="24" cy="35" r="1.2" fill={INK} />
      <circle cx="40" cy="35" r="1.2" fill={INK} />
      <ellipse cx="32" cy="45" rx="3.2" ry="2.4" fill={INK} />
      <path
        d="M28 49 Q32 52 36 49"
        stroke={INK}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  frog: (
    <>
      <circle cx="20" cy="22" r="8" fill="#6CC04A" />
      <circle cx="44" cy="22" r="8" fill="#6CC04A" />
      <circle cx="20" cy="22" r="4.5" fill={WHITE} />
      <circle cx="44" cy="22" r="4.5" fill={WHITE} />
      <circle cx="21" cy="22" r="2.2" fill={INK} />
      <circle cx="45" cy="22" r="2.2" fill={INK} />
      <path d="M10 36 Q32 22 54 36 Q52 54 32 56 Q12 54 10 36 Z" fill="#6CC04A" />
      <path
        d="M20 42 Q32 52 44 42"
        stroke={INK}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <Blush y={40} dx={15} />
    </>
  ),
  owl: (
    <>
      <path d="M16 20 L12 8 L26 16 Z M48 20 L52 8 L38 16 Z" fill="#8D6E63" />
      <ellipse cx="32" cy="36" rx="20" ry="20" fill="#8D6E63" />
      <circle cx="23" cy="33" r="8.5" fill="#F5E6C8" />
      <circle cx="41" cy="33" r="8.5" fill="#F5E6C8" />
      <circle cx="23" cy="33" r="4.2" fill={INK} />
      <circle cx="41" cy="33" r="4.2" fill={INK} />
      <circle cx="24.5" cy="31.5" r="1.4" fill={WHITE} />
      <circle cx="42.5" cy="31.5" r="1.4" fill={WHITE} />
      <path d="M32 38 L28.5 44 L35.5 44 Z" fill="#FFB627" />
      <path
        d="M22 50 Q32 46 42 50"
        stroke="#F5E6C8"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  bear: (
    <>
      <circle cx="17" cy="21" r="8" fill="#9C6644" />
      <circle cx="47" cy="21" r="8" fill="#9C6644" />
      <circle cx="17" cy="21" r="4" fill="#D4A373" />
      <circle cx="47" cy="21" r="4" fill="#D4A373" />
      <ellipse cx="32" cy="37" rx="20" ry="18" fill="#9C6644" />
      <ellipse cx="32" cy="45" rx="9" ry="7" fill="#D4A373" />
      <Eyes y={34} dx={9} />
      <ellipse cx="32" cy="43" rx="3.4" ry="2.6" fill={INK} />
      <path
        d="M32 45.5 L32 48 M29 49 Q32 51 35 49"
        stroke={INK}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  koala: (
    <>
      <circle cx="14" cy="28" r="10" fill="#9E9E9E" />
      <circle cx="50" cy="28" r="10" fill="#9E9E9E" />
      <circle cx="14" cy="28" r="5.5" fill={BLUSH} />
      <circle cx="50" cy="28" r="5.5" fill={BLUSH} />
      <ellipse cx="32" cy="37" rx="19" ry="17" fill="#BDBDBD" />
      <Eyes y={34} dx={8} r={2.8} />
      <ellipse cx="32" cy="44" rx="5" ry="6" fill={INK} />
    </>
  ),
  penguin: (
    <>
      <ellipse cx="32" cy="36" rx="20" ry="21" fill={INK} />
      <path d="M32 24 Q18 26 18 44 Q22 56 32 57 Q42 56 46 44 Q46 26 32 24 Z" fill={WHITE} />
      <circle cx="24.5" cy="32" r="3" fill={INK} />
      <circle cx="39.5" cy="32" r="3" fill={INK} />
      <circle cx="25.5" cy="31" r="1" fill={WHITE} />
      <circle cx="40.5" cy="31" r="1" fill={WHITE} />
      <path d="M26 38 L38 38 L32 44 Z" fill="#FFB627" />
      <Blush y={40} dx={13} />
    </>
  ),
  lion: (
    <>
      <circle cx="32" cy="36" r="24" fill="#D97706" />
      <path
        d="M32 12 l4 6 6-4 1 7 7-1-2 7 7 3-5 5 5 5-7 3 2 7-7-1-1 7-6-4-4 6-4-6-6 4-1-7-7 1 2-7-7-3 5-5-5-5 7-3-2-7 7 1 1-7 6 4z"
        fill="#B45309"
        opacity="0.55"
      />
      <ellipse cx="32" cy="37" rx="16" ry="15" fill="#FBBF24" />
      <circle cx="18" cy="24" r="4.5" fill="#FBBF24" />
      <circle cx="46" cy="24" r="4.5" fill="#FBBF24" />
      <Eyes y={34} dx={7.5} r={2.8} />
      <ellipse cx="32" cy="42" rx="3" ry="2.2" fill={INK} />
      <path
        d="M32 44 L32 47 M28.5 48 Q32 50.5 35.5 48"
        stroke={INK}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  monkey: (
    <>
      <circle cx="13" cy="34" r="8" fill="#8D5524" />
      <circle cx="51" cy="34" r="8" fill="#8D5524" />
      <circle cx="13" cy="34" r="4" fill="#F1C27D" />
      <circle cx="51" cy="34" r="4" fill="#F1C27D" />
      <circle cx="32" cy="35" r="19" fill="#8D5524" />
      <path d="M18 34 Q32 18 46 34 Q46 50 32 52 Q18 50 18 34 Z" fill="#F1C27D" />
      <Eyes y={33} dx={7} r={2.8} />
      <ellipse cx="29" cy="42" rx="1.6" ry="1.2" fill={INK} />
      <ellipse cx="35" cy="42" rx="1.6" ry="1.2" fill={INK} />
      <path
        d="M26 47 Q32 51 38 47"
        stroke={INK}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  rabbit: (
    <>
      <ellipse cx="22" cy="16" rx="6" ry="14" fill="#E0E0E0" />
      <ellipse cx="42" cy="16" rx="6" ry="14" fill="#E0E0E0" />
      <ellipse cx="22" cy="16" rx="3" ry="10" fill={BLUSH} />
      <ellipse cx="42" cy="16" rx="3" ry="10" fill={BLUSH} />
      <ellipse cx="32" cy="40" rx="18" ry="16" fill="#E0E0E0" />
      <Eyes y={38} dx={8} r={2.8} />
      <path d="M30 45 L34 45 L32 47.5 Z" fill={BLUSH} />
      <path
        d="M32 47.5 L32 50 M28.5 51 Q32 53 35.5 51"
        stroke={INK}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <Blush y={44} dx={13} />
    </>
  ),
  tiger: (
    <>
      <circle cx="17" cy="21" r="7.5" fill="#F97316" />
      <circle cx="47" cy="21" r="7.5" fill="#F97316" />
      <ellipse cx="32" cy="37" rx="20" ry="18" fill="#F97316" />
      <path
        d="M32 19 L29 27 L35 27 Z M17 30 L24 31 L20 36 Z M47 30 L40 31 L44 36 Z M14 42 L22 42 L18 47 Z M50 42 L42 42 L46 47 Z"
        fill={INK}
      />
      <ellipse cx="32" cy="45" rx="9" ry="7" fill={WHITE} />
      <Eyes y={35} dx={9} r={2.8} />
      <ellipse cx="32" cy="43" rx="3" ry="2.2" fill={INK} />
      <path
        d="M32 45 L32 47.5 M28.5 48.5 Q32 51 35.5 48.5"
        stroke={INK}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  pig: (
    <>
      <path d="M14 30 L12 16 L26 24 Z" fill="#F9A8D4" />
      <path d="M50 30 L52 16 L38 24 Z" fill="#F9A8D4" />
      <ellipse cx="32" cy="37" rx="20" ry="17" fill="#F9A8D4" />
      <Eyes y={33} dx={9} r={2.8} />
      <ellipse cx="32" cy="44" rx="7.5" ry="5.5" fill="#F472B6" />
      <circle cx="29" cy="44" r="1.6" fill={INK} />
      <circle cx="35" cy="44" r="1.6" fill={INK} />
    </>
  ),
  dog: (
    <>
      <ellipse cx="14" cy="34" rx="7" ry="13" fill="#7C4A1E" />
      <ellipse cx="50" cy="34" rx="7" ry="13" fill="#7C4A1E" />
      <ellipse cx="32" cy="37" rx="19" ry="17" fill="#C68642" />
      <ellipse cx="41" cy="30" rx="7" ry="8" fill="#7C4A1E" opacity="0.6" />
      <Eyes y={34} dx={9} r={2.8} />
      <ellipse cx="32" cy="44" rx="3.6" ry="2.8" fill={INK} />
      <path
        d="M32 46.5 L32 49 M28 50 Q32 53 36 50"
        stroke={INK}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M31 51 Q32 55 35 53"
        stroke={BLUSH}
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  octopus: (
    <>
      <path
        d="M12 52 Q14 44 18 48 M22 56 Q22 46 27 50 M32 58 Q32 48 32 50 M42 56 Q42 46 37 50 M52 52 Q50 44 46 48"
        stroke="#A855F7"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="32" cy="32" rx="20" ry="19" fill="#C084FC" />
      <Eyes y={31} dx={8} r={3.4} />
      <path
        d="M27 40 Q32 44 37 40"
        stroke={INK}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <Blush y={38} dx={14} />
    </>
  ),
  unicorn: (
    <>
      <path d="M32 4 L27 24 L37 24 Z" fill="#FFB627" />
      <path d="M32 4 L29.5 14 L34.5 14 Z" fill="#FDE68A" />
      <path d="M16 30 L12 14 L26 22 Z" fill="#F3F4F6" />
      <path d="M48 30 L52 14 L38 22 Z" fill="#F3F4F6" />
      <path
        d="M14 26 Q10 34 15 40 Q8 42 12 50"
        stroke="#F472B6"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M17 24 Q12 30 17 36"
        stroke="#60A5FA"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="32" cy="38" rx="18" ry="16" fill="#F3F4F6" />
      <Eyes y={36} dx={8} r={2.8} />
      <ellipse cx="32" cy="46" rx="6" ry="4" fill={BLUSH} />
      <circle cx="29.5" cy="46" r="1.2" fill={INK} />
      <circle cx="34.5" cy="46" r="1.2" fill={INK} />
    </>
  ),
}

/** Random animal character on an accent background; the id is assigned server-side and immutable. */
export function AnimalAvatar({ avatar, size = 'md', className, label }: AnimalAvatarProps) {
  const { t } = useTranslation()
  const parts = parseAvatar(avatar)
  const name = parts
    ? t(`avatars.${parts.animal}`, { defaultValue: parts.animal.replace(/[-_]+/g, ' ') })
    : t('avatars.unknown')
  const imageSrc = parts && AVATAR_IMAGE_EXT ? `/avatars/${parts.animal}${AVATAR_IMAGE_EXT}` : null
  return (
    <span
      role="img"
      aria-label={label ? `${name} · ${label}` : name}
      data-testid="avatar"
      data-avatar={avatar ?? undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ring-2 ring-bg-elev-2',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: parts?.color ?? '#3A4470' }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <svg viewBox="0 0 64 64" className="size-[88%]" aria-hidden="true" focusable="false">
          {parts && ANIMALS[parts.animal] ? (
            ANIMALS[parts.animal]
          ) : (
            <circle
              cx="32"
              cy="32"
              r="14"
              fill="none"
              stroke={WHITE}
              strokeWidth="4"
              opacity="0.6"
            />
          )}
        </svg>
      )}
    </span>
  )
}
