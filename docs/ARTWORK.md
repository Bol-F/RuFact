# Regional artwork

The Uzbek and English hero assets are **photo-based, AI-assisted editorial collages**. They are decorative, not documentary photographs or sources for fact-checking. Architecture should not be treated as verified imagery after AI compositing. The handwritten annotations are localised HTML using the existing Caveat font, not text baked into the images.

## Sources and licences

| Shipped asset | Original photograph | Author | Licence |
| --- | --- | --- | --- |
| `public/hero-uzbekistan-collage.webp` | [Registan 01.jpg](https://commons.wikimedia.org/wiki/File:Registan_01.jpg) | Bernard Gagnon (Bgag) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `public/hero-united-kingdom-collage.webp` | [Palace of Westminster, March 2024, cropped](https://commons.wikimedia.org/wiki/File:Palace_of_Westminster_-_wide_panorama_shot_from_Albert_Embankment,_March_2024_(cropped).jpg) | Jdforrester; crop by Cakelot1 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Both photographs were adapted using the built-in image-generation tool: paper backdrop, torn/feathered edges, subdued paper accents, and AI-assisted photo compositing. The results were resized to 1200 × 800 and converted to alpha-preserving WebP. The original photographers do not endorse RuFact. English photo attribution, licence link, and modification notice are displayed in the footer; Uzbek includes the same discoverable credits voluntarily.

The existing Russian `public/hero-collage.png` is unchanged by this redesign.

## Generation brief

The two final asset prompts used the following shared brief, substituting the location and original photograph:

> Adapt the supplied real photograph of Registan, Samarkand / Westminster, London into the existing Russian hero's editorial paper-collage treatment. Preserve the distinctive architecture, relative building positions, photographic detail, and natural daylight. Place the photograph in the lower two thirds, with broad irregular torn ivory paper above the skyline for HTML handwritten notes. Use a small dusty teal / blue paper accent, believable camera texture, gently feathered irregular outside edges, and a genuinely transparent outer background. No lettering, UI, logo, frame, watermark, glossy HDR, or invented Moscow architecture. Keep tall features fully visible.

Mode: built-in `image_gen`, not CLI. All final assets are stored in `public/`, not referenced from a user's home directory.

## Shared design and mobile performance

- Uzbek, Russian, and English share the Russian-derived layout: warm textured paper, a rounded shell, a transparent header, and the same hero, typography, controls, and card family. Colours retain their regional identity: Russian navy/orange, Uzbek teal, and English navy/muted copper. Palette changes do not change interface geometry or semantic red/green verdict colours.
- Copy, handwritten annotations, and collage locations remain localised: Samarkand for Uzbek, Moscow for Russian, and Westminster for English. All three heroes use the same responsive layout and `object-fit: contain` so the collage and tall buildings are not cropped.
- The desktop editor and result panels have aligned top edges. On phones, they stack in one column.
- Below 768px, artwork and handwritten notes are hidden for all three languages. A `<picture>` media source supplies a tiny inline GIF instead of downloading the decorative asset.
- No remote image host or extra client-side image request is required by the application. Source and licence URLs are ordinary external attribution links.
- English uses `en-GB`; changing locale does not reset analyzer drafts, results, or conversation state. The APIs and source-verification pipeline are unchanged.
- Uzbek and English retain a neutral initial result prompt, not an invented verdict or accuracy claim. The shared visual design does not expand the Russian ML model's measured accuracy to other languages.
