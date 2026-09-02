# PLACEHOLDERS

Everything on screen must trace to a `manifest.json` entry whose hash came
from the archive. The ONLY exceptions are listed here, each with what is
missing, why the original cannot be reproduced, and what stands in. The
fidelity judge reviews this file every phase and may reject an entry.

| What | Why it cannot be original | Stand-in |
|---|---|---|
| `file://` image paths (40 controls, all in `dashuisk/skin.xur`) | The console filled these from device storage at runtime (wallpapers, gamer pictures); every one is an empty path in the data. | Nothing is rendered for them today and nothing needs to be: all 40 sit on `XuiScrollEnd` controls whose visuals contain no `XuiImagePresenter`, so no renderer ever consumes the path. `__dash.deviceFiles` counts any that reach a renderer and is 0 on all 263 scenes. If the glue phase wires wallpapers or gamer pictures, they come from the same runtime sources the console used and are listed here first. |
| Code-driven visual states | Some visuals (the metapane `metaScene_1line`, the scroll-end arrows) rest on a frame where the console's code had already moved the playhead (e.g. a `1To2..9To8` panel state chosen by the scene script). | Until the glue drives those states, the runtime shows the visual's own resting frame and reports every such case in `__dash.codeDrivenStates` (hidden-children ratio per visual). Not a substitution: the data is the original, the playhead is not yet driven. |
| Blade tabs at rest | `dashmain.xur`'s `Tab1..Tab6` scenes carry `Opacity 0`; the console's shell code raised the active blade. | Until the blade glue lands, the default route shows only the blade-skin background; `__dash.invisibleAtRest` says so. |
| Text when `reference/fonts/xtt/*.xtt` is absent | The Convection face is not in the dashboard archive; it ships in the console's system flash. | The runtime loads `public/assets/6770/fonts/ConvectionUI.ttf` decoded from the console files by `tools/xtt2ttf.py`; only when those files are missing does text fall back to the browser's sans-serif, flagged in `__dash.placeholders`. |
