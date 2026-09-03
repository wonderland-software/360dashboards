// XuiHtmlElement: the tiny markup dialect the NXE chrome writes.
//
// `XuiHtmlElement : XuiElement` owns `Text` and `TeletypeCount` [registry], and
// 25 scenes carry one [class census]. The only thing the shell itself needs it
// for is the slot counter under the front panel, whose text is
// `dashcomm/dashStrings.xus[27]`:
//
//   <FONT SIZE="15" COLOR="#736F6F" SHADOWCOLOR="#59FFFFFF"><DS>%d of %d </DS></FONT>
//
// ([17] is the bare `%d of %d`.) So the dialect in use is exactly `<FONT>` with
// SIZE / COLOR / SHADOWCOLOR, and `<DS>` for a drop shadow. Colours are
// `#RRGGBB` or `#AARRGGBB`, the console's own order.
//
// This renders that subset and NOTHING else: an unknown tag is dropped and
// recorded, because inventing a rendering for markup we have not seen in the
// build would be inventing screen content. `SIZE` is a XUI PointSize, so it
// goes through the same PointSize -> design px rule as every other text.
import { POINT_SIZE_TO_DESIGN_PX, FONT_FALLBACK } from '@runtime/index';

export interface HtmlRender {
  el: HTMLElement;
  /** Tags in the source this renderer does not implement. */
  unknownTags: string[];
}

const COLOUR = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

function cssColour(v: string): string | null {
  if (!COLOUR.test(v)) return null;
  const h = v.slice(1);
  if (h.length === 6) return `#${h}`;
  const a = parseInt(h.slice(0, 2), 16) / 255;
  return `rgba(${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${parseInt(h.slice(6, 8), 16)}, ${a.toFixed(3)})`;
}

/**
 * Render one XuiHtmlElement's Text. `dropShadowOffset` is the same 1 design px
 * down-right the text renderer uses (INFERRED there, INFERRED here).
 */
export function renderHtmlText(source: string): HtmlRender {
  const el = document.createElement('div');
  el.dataset['xuiPaint'] = 'html';
  el.style.cssText = [
    'position:absolute', 'left:0', 'top:0', 'width:100%', 'height:100%',
    `font-family:${FONT_FALLBACK}`, 'white-space:pre', 'line-height:1',
  ].join(';');

  const unknownTags: string[] = [];
  // The source is a fragment, not a document; wrap it so one parse covers it.
  const doc = new DOMParser().parseFromString(`<x>${source}</x>`, 'text/html');
  const root = doc.body.firstElementChild ?? doc.body;

  const emit = (node: Node, span: HTMLElement): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) { span.appendChild(document.createTextNode(child.nodeValue ?? '')); continue; }
      if (!(child instanceof Element)) continue;
      const tag = child.tagName.toUpperCase();
      const next = document.createElement('span');
      if (tag === 'FONT') {
        const size = child.getAttribute('SIZE') ?? child.getAttribute('size');
        const colour = child.getAttribute('COLOR') ?? child.getAttribute('color');
        const shadow = child.getAttribute('SHADOWCOLOR') ?? child.getAttribute('shadowcolor');
        if (size && Number.isFinite(Number(size))) next.style.fontSize = `${Number(size) * POINT_SIZE_TO_DESIGN_PX}px`;
        const c = colour ? cssColour(colour) : null;
        if (c) next.style.color = c;
        if (shadow) next.dataset['shadow'] = cssColour(shadow) ?? shadow;
      } else if (tag === 'DS') {
        // <DS> turns the enclosing FONT's SHADOWCOLOR into a drop shadow.
        let host: HTMLElement | null = span;
        let colour: string | null = null;
        while (host && !colour) { colour = host.dataset['shadow'] ?? null; host = host.parentElement; }
        if (colour) next.style.textShadow = `1px 1px 0 ${colour}`;
      } else {
        if (!unknownTags.includes(tag)) unknownTags.push(tag);
        next.dataset['xuiHtmlUnknown'] = tag;
      }
      span.appendChild(next);
      emit(child, next);
    }
  };
  emit(root, el);
  return { el, unknownTags };
}

/** `printf`-style `%d of %d`, with exactly the two integers the console had. */
export function formatCounter(fmt: string, a: number, b: number): string {
  let n = 0;
  return fmt.replace(/%d/g, () => String(n++ === 0 ? a : b));
}
