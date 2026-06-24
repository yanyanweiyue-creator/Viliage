# Audio assets and replacement guide

All bundled animal recordings are replaceable from `public/site-config.js` under
`ecosystem.audio.samples`. Keep replacement files in `public/audio/` and update
only the matching `src` value. When no file is configured or a file cannot be
decoded, the app uses a species-specific Web Audio fallback.

## Bundled recordings

- `public/audio/sfx/cow.ogg` — “Single Cow Moo” by MichaeltheFox8621,
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Single_Cow_Moo.ogg),
  licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `public/audio/sfx/sheep.ogg` — “Sheep bleat” by Eviatar Bach,
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sheep_bleat.ogg),
  released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- `public/audio/sfx/gull.ogg` — optional, currently unused “Gull 2” recording by avphillips,
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Gull_2.ogg),
  released into the public domain through PDSounds.
- `public/audio/sfx/deer.ogg` — “American Elk Bugling” by Jim Pisarowicz / U.S.
  National Park Service,
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:American_Elk_Bugling.ogg),
  public domain as a work created in official U.S. federal duties.

The fox, rabbit, songbird, gull, footsteps, dawn-dragon whoosh, and Waffles answer
chirp currently use distinct procedural Web Audio voices. Bird and gull calls
use a deliberately quiet, slow-fading tone with a short spatial echo. These can be replaced
with licensed recordings by adding entries to the same sample manifest.

## Background music

No commercial song is bundled or published. A local `.mgg` file is a protected
QQ Music container and cannot be played by web browsers. A locally playable
file still needs public-performance and web-distribution permission before it is
included in a public deployment.

To add music that the project owns or is licensed to publish:

1. Export it as OGG, MP3, or WAV.
2. Put it in `public/audio/music/`.
3. Set `ecosystem.audio.music.day` and/or `night` in `public/site-config.js`.
4. Keep the credit and license in this file.

Empty music paths intentionally fall back to two original built-in scores:
`Garden Footsteps` by day and `Starlit Current` by night. Their tempo metadata
lives under `ecosystem.audio.proceduralMusic` in `public/site-config.js`.

Users may also choose their own day/night files in Settings. Those files remain
inside that browser's IndexedDB and are never uploaded or committed to this
repository. A local user file takes priority over configured site music and the
procedural score; removing it restores the normal fallback order.
