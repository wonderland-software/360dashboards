// XuiImage / XuiImagePresenter.
// A presenter shows the OWNING control's ImagePath, an image its own.
import * as E from '../../xuiEnums';
import type { PropBag } from '../props';
import type { RenderCtx } from '../DomRenderer';
import { note, noteNum } from '../../telemetry';
import { activeBuild } from '../../build';

export function renderImage(
  p: PropBag, w: number, h: number, ctx: RenderCtx, ownerPath: string | null, ownPath: boolean,
  imageSlots?: Map<number, string>,
): HTMLElement | null {
  let raw = ownPath ? p.str('ImagePath') : (ownerPath ?? '');
  const mode = p.num('SizeMode', E.DEFAULT_SIZE_MODE);
  noteNum(ctx.report.sizeModesSeen, mode);
  if (!E.KNOWN_SIZE_MODES.includes(mode)) note(ctx.report.unknownClasses, `SizeMode=${mode}`);
  if (!ownPath) {
    const assoc = p.num('DataAssociation', E.DATA_ASSOCIATION_PRIMARY);
    noteNum(ctx.report.dataAssociationsSeen, assoc);
    // See BuildProfile.gateImageDataAssociation: a secondary channel is console
    // data. The glue can FILL one - a Moby slot's icon is association 20 - and
    // then the presenter draws it with its OWN SizeMode and its own box, which
    // is the whole point of routing it through here rather than injecting an
    // <img>: `imgIcon` sets no SizeMode, so the default (NORMAL: natural size,
    // top-left) applies, and an icon drawn `contain`-fitted to the 208x342 box
    // lands ~30 px low. Unfilled, the presenter still draws NOTHING rather than
    // repeating the primary image.
    if (activeBuild().gateImageDataAssociation && assoc !== E.DATA_ASSOCIATION_PRIMARY) {
      const supplied = imageSlots?.get(assoc);
      if (!supplied) {
        note(ctx.report.runtimeDrivenClasses, `XuiImagePresenter#DataAssociation=${assoc}`);
        return null;
      }
      raw = supplied;
    }
  }
  if (!raw) return null;

  const res = ctx.assets.resolveImage(ctx.pack, raw);
  if (res.deviceFile) { note(ctx.report.deviceFiles, res.path); return null; }
  // XUI can point an image at a SCENE and render it to a texture: eleven scenes
  // do it with common://TitleMetadata.xur. The file exists; drawing it needs an
  // offscreen render target, which M1 does not have.
  if (/\.xur$/i.test(res.path)) { note(ctx.report.sceneTextures, raw); return null; }
  if (!res.url) { note(ctx.report.missingImages, raw); return null; }

  const css = E.sizeModeToCss(mode);
  const img = document.createElement('img');
  img.src = res.url;
  img.draggable = false;
  img.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${w}px`, `height:${h}px`,
    `object-fit:${css.fit}`, `object-position:${css.position}`,
    'image-rendering:auto',
  ].join(';');
  img.addEventListener('error', () => note(ctx.report.missingImages, raw));
  return img;
}
