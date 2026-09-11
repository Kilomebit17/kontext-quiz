# Avatar sources

Drop the original character images here — one file per character:

- formats: `png`, `jpg`, `webp`, `svg`, `gif`
- the file name becomes the character id: `Black Sheep.png` → `black-sheep`
- transparent background is best (the app draws the coloured circle behind the
  character); opaque images are used as-is
- any size; the character is trimmed and fitted into a 320×320 square

Then build the set:

```sh
pnpm --filter @kontext/web avatars
```

This writes `apps/web/public/avatars/<id>.webp` and regenerates
`packages/shared/src/avatar-catalog.ts`, which the server uses to assign
random avatars and the web app uses to render them.
