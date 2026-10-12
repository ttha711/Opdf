import { expect, test } from "@playwright/test";

function layeredPdf() {
  const stream=[
    "/OC /Grid BDC",
    "1 0 0 rg 0 0 100 100 re f",
    "EMC",
    "/OC /Services BDC",
    "0 0 1 rg 100 0 100 100 re f",
    "EMC",
    "0 0 0 RG 2 w 20 20 m 80 20 l S",
  ].join("\n")+"\n";
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R 7 0 R] /D << /BaseState /ON /Order [6 0 R 7 0 R] >> >> >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Properties << /Grid 6 0 R /Services 7 0 R >> >> /Contents 4 0 R >>",
    "<< /Length "+Buffer.byteLength(stream)+" >>\nstream\n"+stream+"endstream",
    "<< /Producer (OPDF CAD E2E) >>",
    "<< /Type /OCG /Name (Grid) >>",
    "<< /Type /OCG /Name (Services) >>",
  ];
  let data="%PDF-1.7\n";
  const offsets=[0];
  for(let i=0;i<objects.length;i++) {
    offsets.push(Buffer.byteLength(data));
    data+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const pos=Buffer.byteLength(data);
  data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))data+=String(offset).padStart(10,"0")+" 00000 n \n";
  data+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  return Buffer.from(data);
}

test("toggle real PDF OCG pixels and snap to CAD vector endpoints",async({page})=>{
  test.setTimeout(90_000);
  await page.goto("/");
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name:"cad-layers.pdf", mimeType:"application/pdf", buffer:layeredPdf(),
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({timeout:20_000});
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox",{name:"Find a command"}).fill("drawing layers");
  await page.locator('[data-opdf-command="drawing"]').click();
  await page.locator('[data-opdf-action="open-drawing-workspace"]').click();
  const workspace=page.locator('[data-opdf-drawing-workspace="true"]');
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('[data-opdf-ocg]')).toHaveCount(2,{timeout:20_000});
  const canvas=workspace.locator('[data-opdf-layer-canvas]');
  const pixel=()=>canvas.evaluate(element=>{
    const c=element as HTMLCanvasElement;
    const pixel=c.getContext("2d")!.getImageData(
      Math.round(c.width*0.4),Math.round(c.height*0.75),1,1).data;
    return {r:pixel[0],g:pixel[1],b:pixel[2]};
  });
  await expect.poll(async()=> (await pixel()).b>180).toBe(true);
  await workspace.getByRole("checkbox",{name:"Services"}).uncheck();
  await expect.poll(async()=> (await pixel()).r>230 && (await pixel()).g>230).toBe(true);
  await workspace.getByRole("checkbox",{name:"Services"}).check();
  await expect.poll(async()=> (await pixel()).b>180).toBe(true);

  await workspace.getByRole("checkbox",{name:"Enable drawing measurement & snap"}).check();
  await expect(workspace.getByText(/vector segments ready/)).toBeVisible({timeout:20_000});
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  // PDF y=20 appears at screen y=180; a true vector endpoint is (20,20).
  await page.mouse.move(rect!.x+24,rect!.y+180);
  await expect(workspace.locator('[data-opdf-cad-overlay] text').filter({hasText:"endpoint"})).toBeVisible();
  await page.mouse.click(rect!.x+24,rect!.y+180);
  await page.mouse.click(rect!.x+78,rect!.y+180);
  await expect(workspace.locator('[data-opdf-cad-overlay] circle')).toHaveCount(2);
  await expect(workspace.locator('[data-opdf-cad-overlay]')).toContainText("0.021 m");
});
