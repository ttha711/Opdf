import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("parallel upload chunks assemble byte-for-byte and appear in recents", async ({ request }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  const base = Buffer.from(await pdf.save());
  const bytes = Buffer.concat([base, Buffer.alloc(18 * 1024 * 1024, 0x20)]);

  const create = await request.post(`/api/opdf/uploads?name=parallel-upload.pdf&size=${bytes.length}`);
  expect(create.status()).toBe(201);
  const session = await create.json() as {
    id: string;
    filePath: string;
    chunkBytes: number;
  };

  const indexes = Array.from(
    { length: Math.ceil(bytes.length / session.chunkBytes) },
    (_, index) => index,
  ).reverse();

  const responses = await Promise.all(indexes.map((index) => {
    const start = index * session.chunkBytes;
    const end = Math.min(bytes.length, start + session.chunkBytes);
    return request.put(
      `/api/opdf/uploads/${session.id}/chunks/${index}?size=${bytes.length}`,
      { data: bytes.subarray(start, end) },
    );
  }));
  expect(responses.every((response) => response.ok())).toBeTruthy();

  const complete = await request.post(
    `/api/opdf/uploads/${session.id}/complete?size=${bytes.length}`,
  );
  expect(complete.status()).toBe(201);

  const stored = await request.get(`/api/opdf/documents/${session.id}`);
  expect(stored.ok()).toBeTruthy();
  expect(Buffer.compare(Buffer.from(await stored.body()), bytes)).toBe(0);

  const recents = await request.get("/api/opdf/recent");
  expect(recents.ok()).toBeTruthy();
  await expect(recents.json()).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ filePath: session.filePath })]),
  );
});
