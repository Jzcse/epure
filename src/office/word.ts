/** Word（Office.js）文档操作：插入 / 读取 / 替换 Epure 图形 */
import type { InsertPayload } from '../io';
import { decodeDoc, isEncodedDoc } from '../doc';
import { esc, utf8ToB64 } from '../util';

const EMU_PER_PT = 12700;
const PT_PER_PX = 0.75;
/** 编辑期间给目标图片打的标题标记，便于对话框关闭后重新定位 */
const TAG_PREFIX = 'EPURE#';
const TITLE = 'Epure';

/** 单个内嵌图片的 Flat OPC 包：PNG 为兼容回退，svgBlip 扩展提供矢量 */
export function buildOoxml(p: InsertPayload, widthPt: number, heightPt: number): string {
  const cx = Math.round(widthPt * EMU_PER_PT);
  const cy = Math.round(heightPt * EMU_PER_PT);
  const descr = esc(p.data);
  return `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>
</pkg:xmlData></pkg:part>
<pkg:part pkg:name="/word/_rels/document.xml.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdEpurePng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/epure.png"/>
<Relationship Id="rIdEpureSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/epure.svg"/>
</Relationships>
</pkg:xmlData></pkg:part>
<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="1" name="Epure Diagram" title="${TITLE}" descr="${descr}"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>
<pic:nvPicPr><pic:cNvPr id="0" name="epure.svg"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rIdEpurePng"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdEpureSvg"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline>
</w:drawing></w:r></w:p></w:body></w:document>
</pkg:xmlData></pkg:part>
<pkg:part pkg:name="/word/media/epure.png" pkg:contentType="image/png" pkg:compression="store"><pkg:binaryData>${p.png}</pkg:binaryData></pkg:part>
<pkg:part pkg:name="/word/media/epure.svg" pkg:contentType="image/svg+xml" pkg:compression="store"><pkg:binaryData>${utf8ToB64(p.svg)}</pkg:binaryData></pkg:part>
</pkg:package>`;
}

export interface EditTarget {
  /** 打在图片标题上的临时标记 */
  tag: string;
  /** 图片源数据 */
  data: string;
  /** 用户在 Word 中设置的缩放（当前宽度 / 原始宽度） */
  scale: number;
}

/** 读取当前选区中的 Epure 图片，打上标记供稍后替换；没有则返回 null */
export async function findSelectedDiagram(): Promise<EditTarget | null> {
  return Word.run(async (ctx) => {
    const pics = ctx.document.getSelection().inlinePictures;
    pics.load('items/altTextDescription,items/width');
    await ctx.sync();
    const pic = pics.items.find((p) => isEncodedDoc(p.altTextDescription));
    if (!pic) return null;
    const data = pic.altTextDescription;
    const doc = await decodeDoc(data);
    const natural = doc?.size ? doc.size.w * PT_PER_PX : 0;
    const scale = natural > 0 && pic.width > 0 ? pic.width / natural : 1;
    const tag = TAG_PREFIX + Math.random().toString(36).slice(2);
    pic.altTextTitle = tag;
    await ctx.sync();
    return { tag, data, scale };
  });
}

/** 按标记找回图片（找不到返回 null） */
async function findTagged(ctx: Word.RequestContext, tag: string): Promise<Word.InlinePicture | null> {
  const pics = ctx.document.body.inlinePictures;
  pics.load('items/altTextTitle');
  await ctx.sync();
  return pics.items.find((p) => p.altTextTitle === tag) ?? null;
}

/** 取消编辑时清除临时标记 */
export async function clearTag(tag: string): Promise<void> {
  await Word.run(async (ctx) => {
    const pic = await findTagged(ctx, tag);
    if (pic) {
      pic.altTextTitle = TITLE;
      await ctx.sync();
    }
  });
}

/** 插入新图（光标处）或替换 target 对应的旧图 */
export async function insertDiagram(p: InsertPayload, target: EditTarget | null): Promise<void> {
  const scale = target?.scale ?? 1;
  const widthPt = p.width * PT_PER_PX * scale;
  const heightPt = p.height * PT_PER_PX * scale;

  await Word.run(async (ctx) => {
    let range: Word.Range | null = null;
    if (target) {
      const old = await findTagged(ctx, target.tag);
      if (old) range = old.getRange('Whole');
    }
    range ??= ctx.document.getSelection();

    try {
      range.insertOoxml(buildOoxml(p, widthPt, heightPt), 'Replace');
      await ctx.sync();
    } catch (err) {
      // 回退：仅插入 PNG（老版本 Word 或 OOXML 被拒绝时）
      console.warn('OOXML 插入失败，改用 PNG：', err);
      const pic = range.insertInlinePictureFromBase64(p.png, 'Replace');
      pic.altTextTitle = TITLE;
      pic.altTextDescription = p.data;
      pic.width = widthPt;
      pic.height = heightPt;
      await ctx.sync();
    }
  });
}
