# PLACEHOLDERS

Everything on screen must trace to a `manifest.json` entry whose hash came
from the archive. The ONLY exceptions are listed here, each with what is
missing, why the original cannot be reproduced, and what stands in. The
fidelity judge reviews this file every phase and may reject an entry.

| What | Why it cannot be original | Stand-in |
|---|---|---|
| `file://` image paths (40 controls) | The console loaded these from device storage at runtime (wallpapers, gamer pictures); every one is an empty path in the scenes, filled by code. | Rendered empty until the glue phase supplies the same runtime data the console would; logged in `__dash.placeholders`. |
| Text when `reference/fonts/xtt/*.xtt` is absent | The Convection face is not in the dashboard archive; it ships in the console's system flash. | The runtime loads `public/assets/6770/fonts/ConvectionUI.ttf` decoded from the console files by `tools/xtt2ttf.py`; only when those files are missing does text fall back to the browser's sans-serif, flagged in `__dash.placeholders`. |
