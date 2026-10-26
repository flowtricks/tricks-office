# T.RICKS Office

An interactive 3D office built with Astro, Three.js, and Lumos for Astro.
Walk around, sit at the desk, inspect shelf objects, adjust the standing desk,
and ask the Echo Dot to switch the room lights on or off.

## Development

Requires Node.js 22.23.4 or newer.

```sh
npm ci
npm run dev -- --background
```

Use `npx astro dev status`, `npx astro dev logs`, and `npx astro dev stop`
to manage the background server.

```sh
npm run check
npm run build
npm run preview
```

The main scene is in `src/components/content/OfficeGame.astro`. Scene behavior
lives in `src/scripts/`, and runtime models and textures are in `public/`.
The `scripts/check-*.mjs` scripts verify character motion and scene behavior.
Model preparation scripts require their original source assets and, in some
cases, Blender; those local source files are not required to run the site.

## Credits and licensing

Built on [Lumos for Astro](https://lumosframework.com).
Framework and code licensing is documented in [LICENSE](LICENSE).
Third-party models retain their respective licenses and attributions in
`public/models/*.LICENSE.txt`; those assets are not relicensed by the code license.

## Deployment

The site runs on Cloudflare Workers at https://office.timothyricks.com.
`wrangler.jsonc` pins the TRICKS account and custom domain. Authenticate with
`npx wrangler login`, then run `npm run deploy` to build and publish.

The favicon and app icons are transparent renders of the actual character.
The social image is a clean render of the office without the interface. During
local development, open `/?export-branding` for the source render controls.
