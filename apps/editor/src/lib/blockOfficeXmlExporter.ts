import { AIParsedDocument } from "../types";

const escapeXMLEntities = (str: string) => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

export function exportDocToXml(currentDoc: AIParsedDocument) {
  try {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<AIParsedDocument>\n`;
    xml += `  <Title>${escapeXMLEntities(currentDoc.title || "")}</Title>\n`;
    xml += `  <Description>${escapeXMLEntities(currentDoc.description || "")}</Description>\n`;
    xml += `  <Theme>${escapeXMLEntities(currentDoc.theme || "")}</Theme>\n`;
    xml += `  <Blocks>\n`;

    currentDoc.blocks.forEach(block => {
      xml += `    <Block type="${escapeXMLEntities(block.type)}">\n`;
      xml += `      <Id>${escapeXMLEntities(block.id)}</Id>\n`;
      xml += `      <Content>${escapeXMLEntities(block.content)}</Content>\n`;
      
      if (block.meta) {
        xml += `      <Meta>\n`;
        if (block.meta.level) xml += `        <Level>${block.meta.level}</Level>\n`;
        if (block.meta.calloutType) xml += `        <CalloutType>${escapeXMLEntities(block.meta.calloutType)}</CalloutType>\n`;
        if (block.meta.slideBg) xml += `        <SlideBg>${escapeXMLEntities(block.meta.slideBg)}</SlideBg>\n`;
        if (block.meta.chartType) xml += `        <ChartType>${escapeXMLEntities(block.meta.chartType)}</ChartType>\n`;
        
        if (block.meta.chartDataKeys) {
          xml += `        <ChartDataKeys>\n`;
          block.meta.chartDataKeys.forEach(key => {
            xml += `          <Key>${escapeXMLEntities(key)}</Key>\n`;
          });
          xml += `        </ChartDataKeys>\n`;
        }

        if (block.meta.bulletPoints) {
          xml += `        <BulletPoints>\n`;
          block.meta.bulletPoints.forEach(bp => {
            xml += `          <Bullet>${escapeXMLEntities(bp)}</Bullet>\n`;
          });
          xml += `        </BulletPoints>\n`;
        }
        xml += `      </Meta>\n`;
      }

      if (block.tableData) {
        xml += `      <TableData>\n`;
        block.tableData.forEach((row, rIdx) => {
          xml += `        <Row index="${rIdx}">\n`;
          row.forEach((cell, cIdx) => {
            xml += `          <Cell index="${cIdx}">\n`;
            xml += `            <Value>${escapeXMLEntities(cell.value)}</Value>\n`;
            if (cell.formula) {
              xml += `            <Formula>${escapeXMLEntities(cell.formula)}</Formula>\n`;
            }
            xml += `          </Cell>\n`;
          });
          xml += `        </Row>\n`;
        });
        xml += `      </TableData>\n`;
      }

      xml += `    </Block>\n`;
    });

    xml += `  </Blocks>\n`;
    xml += `</AIParsedDocument>\n`;

    const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDoc.title || "document"}_structured_model.xml`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Xuất XML gặp lỗi.");
  }
}
