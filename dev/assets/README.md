# Artwork sources and exports

`source/` contains the inputs used by the artwork preparation scripts and the
live splash color editor. Its WebP masters use lossless compression with
`exact: true`, preserving all RGBA pixels, including RGB under transparent pixels.
Keep these masters in Git. Original PNG imports remain local and are ignored.

`prepared/` contains generated full-resolution PNG/WebP previews for reviewing
color bakes. These image exports are ignored. The small JSON settings and
manifests stay in Git to record recipes and provenance.

Production builds use the prepared runtime images in `src/lib/**/assets/`,
`src/lib/assets/`, and `static/`, alongside runtime models and audio. Those files
must stay in Git. Neither the npm build nor the Pages build reruns the artwork
preparation scripts.

The preparation tools read the lossless masters to regenerate runtime output:

- `dev/tooling/weapons/prepare-thumbnails.mjs`: armory thumbnails.
- `dev/tooling/targets/prepare.mjs`: target textures, masks, and geometry.
- `dev/tooling/hud/prepare.mjs`: HUD panels and masks.
- `dev/tooling/favicon/prepare.mjs`: favicon PNG and ICO.
- `dev/tooling/splash/bake-splash2.mjs`: reviewed splash and logo color bakes.

`capture-previews.mjs` and `prepare-splash2.mjs` write new masters using
`sharp(input).webp({ lossless: true, exact: true, effort: 6 })`.
Use the same settings when importing replacement artwork for the other tools.
