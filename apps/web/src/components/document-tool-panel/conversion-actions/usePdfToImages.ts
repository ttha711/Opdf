import type React from "react";
import { convertBlobToGrayscale, downloadFile } from "./helpers";

interface UsePdfToImagesArgs {
  docBytes: Uint8Array | null;
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  imgFormat: "png" | "jpg";
  imgOutputOption: "one-per-page" | "all-in-one";
  imgZoom: number;
  imgColorMode: "color" | "grayscale";
  fileBase: string;
  fileName: string;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setViewerError: (msg: string | null) => void;
}

export function usePdfToImages(args: UsePdfToImagesArgs) {
  const {
    docBytes,
    thumbnails,
    imgFormat,
    imgOutputOption,
    imgZoom,
    imgColorMode,
    fileBase,
    fileName,
    setIsProcessing,
    setViewerError,
  } = args;

  const handlePdfToImages = async () => {
    if (!docBytes || thumbnails.length === 0) {
      alert("Please wait for all pages to finish rendering before converting.");
      return;
    }
    setIsProcessing(true);
    setViewerError("Preparing high-res images...");
    try {
      const isPng = imgFormat === "png";
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};

      if (imgOutputOption === "all-in-one") {
        const imgElements: HTMLImageElement[] = await Promise.all(
          thumbnails.map((t) => {
            return new Promise<HTMLImageElement>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.src = URL.createObjectURL(t.blob);
            });
          })
        );

        const canvas = document.createElement("canvas");
        const totalHeight = imgElements.reduce((h, img) => h + img.height, 0);
        const maxWidth = Math.max(...imgElements.map((img) => img.width));
        canvas.width = maxWidth * (imgZoom / 100);
        canvas.height = totalHeight * (imgZoom / 100);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (imgColorMode === "grayscale") {
            ctx.filter = "grayscale(100%)";
          }
          let currentY = 0;
          for (const img of imgElements) {
            const drawW = img.width * (imgZoom / 100);
            const drawH = img.height * (imgZoom / 100);
            ctx.drawImage(img, 0, currentY, drawW, drawH);
            currentY += drawH;
          }

          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then((buf) => {
                downloadFile(new Uint8Array(buf), `${fileBase}-full-pages.${imgFormat}`, [imgFormat]);
              });
            }
          }, isPng ? "image/png" : "image/jpeg");
        }
      } else {
        for (const thumb of thumbnails) {
          let processedBlob = thumb.blob;
          if (imgColorMode === "grayscale") {
            processedBlob = await convertBlobToGrayscale(thumb.blob, isPng);
          }
          if (imgZoom !== 100) {
            processedBlob = await new Promise<Blob>((resolve) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width * (imgZoom / 100);
                canvas.height = img.height * (imgZoom / 100);
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  if (imgColorMode === "grayscale") ctx.filter = "grayscale(100%)";
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  canvas.toBlob((b) => resolve(b || processedBlob), isPng ? "image/png" : "image/jpeg");
                } else {
                  resolve(processedBlob);
                }
              };
              img.src = URL.createObjectURL(processedBlob);
            });
          }
          const buf = await processedBlob.arrayBuffer();
          zipData[`page-${thumb.page}.${imgFormat}`] = new Uint8Array(buf);
        }
        const zipped = zipSync(zipData);
        await downloadFile(zipped, `${fileName}-images.zip`, ["zip"]);
      }

      setViewerError(null);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to convert images: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  return { handlePdfToImages };
}
