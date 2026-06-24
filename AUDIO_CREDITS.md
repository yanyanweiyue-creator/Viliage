# Audio assets and replacement guide

All bundled animal recordings are replaceable from `public/site-config.js` under
`ecosystem.audio.samples`. Keep replacement files in `public/audio/` and update
only the matching `src` value. When no file is configured or a file cannot be
decoded, the app uses a species-specific Web Audio fallback.

## Bundled recordings

- `public/audio/sfx/morning-birds.mp3` — project-provided ElevenLabs-generated
  gentle morning bird ambience. Playback uses only the opening 3.2 seconds with
  a short fade-in and fade-out.

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

The fox, rabbit, footsteps, dawn-dragon whoosh, and Waffles answer chirp use
distinct procedural Web Audio voices. Songbirds and gulls use the quiet
project-provided sample above; when it cannot be decoded, they fall back to a
slow-fading procedural tone. Any voice can be replaced by changing the same
sample manifest.

## Scheduled ambience

- `public/audio/ambience/summer-insects.mp3` — project-provided
  ElevenLabs-generated sparse insect ambience. It loops quietly through the
  environment channel only during the user's local summer from 10:00 to 16:00.
- `public/audio/ambience/sunrise-farm.mp3` — project-provided
  ElevenLabs-generated small-farm morning ambience. It loops only from 15
  minutes before through 45 minutes after the user's local sunrise.

Both schedules use the approximate IP-derived time zone and sunrise supplied by
the environment API. Replace either file or edit its window under
`ecosystem.audio.ambience` in `public/site-config.js`.

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
