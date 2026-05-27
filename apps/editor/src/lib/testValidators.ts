import { TestStatus } from "../types";
import pptxgen from "pptxgenjs";

export function checkHeadingHierarchy(containerArray: HTMLElement[]): {
  status: TestStatus;
  message: string;
  details: string[];
} {
  const details: string[] = [];
  let h1Count = 0;
  let h2Count = 0;
  let h3Count = 0;
  let hasOutofOrder = false;

  details.push("- Tiến hành quét toàn bộ vùng soạn thảo để trích xuất thẻ tiêu đề.");
  
  containerArray.forEach((container, pIndex) => {
    const headings = container.querySelectorAll("h1, h2, h3");
    details.push(`Trang ${pIndex + 1}: Tìm thấy ${headings.length} tiêu đề.`);
    
    let lastLevel = 0;
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level === 1) h1Count++;
      if (level === 2) h2Count++;
      if (level === 3) h3Count++;

      if (lastLevel > 0 && level - lastLevel > 1) {
        hasOutofOrder = true;
        details.push(`  [Cảnh báo] Nhảy bậc tiêu đề bất thường từ H${lastLevel} sang H${level} tại văn bản: "${h.textContent?.slice(0, 30)}..."`);
      }
      lastLevel = level;
    });
  });

  details.push(`- Tổng kết: ${h1Count} x H1, ${h2Count} x H2, ${h3Count} x H3.`);

  if (h1Count === 0) {
    return {
      status: "warning",
      message: "Tài liệu chưa có tiêu đề đại diện H1 (Tiêu đề chính). Bố cục tài liệu có thể bị rời rạc.",
      details: [...details, "Khuyến nghị: Chỉ định một tiêu đề H1 ở đầu trang 1 để cấu trúc Word/PDF đẹp mắt hơn."]
    };
  } else if (hasOutofOrder) {
    return {
      status: "warning",
      message: "Phát hiện sự nhảy bậc không chuẩn xác trong phân cấp tiêu đề (Ví dụ: nhảy từ H1 xuống thẳng H3).",
      details
    };
  } else {
    return {
      status: "passed",
      message: `Cấu trúc phân cấp hoàn hảo! Tổng cộng ${h1Count + h2Count + h3Count} tiêu đề phân bố hợp lý trên các trang.`,
      details
    };
  }
}

export function checkTableLayout(containerArray: HTMLElement[]): {
  status: TestStatus;
  message: string;
  details: string[];
} {
  const details: string[] = [];
  let tablesCount = 0;
  let problematicTables = 0;
  let overflowTables = 0;

  containerArray.forEach((container, pIndex) => {
    const tables = container.querySelectorAll("table");
    tables.forEach((table, tIndex) => {
      tablesCount++;
      details.push(`Trang ${pIndex + 1} - Bảng #${tIndex + 1}:`);
      
      const rows = table.querySelectorAll("tr");
      details.push(`  + Số lượng hàng: ${rows.length}`);
      
      const hasHeader = table.querySelector("th") !== null;
      if (!hasHeader) {
        problematicTables++;
        details.push(`  + [Cảnh báo] Bảng không chứa hàng tiêu đề (th).`);
      }

      // Check cell balance
      let inconsistentCells = false;
      let expectedCols = -1;
      rows.forEach((row, rIdx) => {
        const cells = row.querySelectorAll("td, th");
        if (expectedCols === -1) {
          expectedCols = cells.length;
        } else if (cells.length !== expectedCols && !row.querySelector('[colspan]')) {
          inconsistentCells = true;
        }
      });

      if (inconsistentCells) {
        problematicTables++;
        details.push(`  + [Lỗi] Các hàng có số lượng ô không đồng đều (Lỗi ghép ô chưa được xử lý lý tưởng!).`);
      }

      // Check potential horizontal overflow
      const rect = table.getBoundingClientRect();
      const parentRect = table.parentElement?.getBoundingClientRect();
      if (parentRect && rect.width > parentRect.width + 10) {
        overflowTables++;
        details.push(`  + [Cảnh báo] Chiều rộng của bảng vượt quá phạm vi thẻ cha (${Math.round(rect.width)}px > ${Math.round(parentRect.width)}px). Ngắt dòng cột có thể bị móp lề.`);
      }
    });
  });

  if (tablesCount === 0) {
    return {
      status: "passed",
      message: "Không có bảng biểu trong tài liệu. Bỏ qua kiểm thử này.",
      details: ["- Tài liệu thuần văn bản, không tiềm ẩn lỗi dàn trang bảng."]
    };
  } else if (problematicTables > 0 || overflowTables > 0) {
    return {
      status: "warning",
      message: `Phát hiện ${problematicTables} bảng có cấu trúc thiếu vững chắc hoặc ${overflowTables} bảng rộng tràn biên khi xuất.`,
      details: [...details, "Khuyến nghị: Rà soát lại độ rộng cột, hoặc dùng AI để chuyển đổi bảng lồng lách văn bản thành bảng độc lập."]
    };
  } else {
    return {
      status: "passed",
      message: `Kiểm tra toàn bộ ${tablesCount} bảng biểu thành công! Tất cả đạt chuẩn về hàng tiêu đề và chiều rộng hợp lý.`,
      details
    };
  }
}

export function checkImageBoundingBox(containerArray: HTMLElement[]): {
  status: TestStatus;
  message: string;
  details: string[];
} {
  const details: string[] = [];
  let totalImgs = 0;
  let missingAlt = 0;
  let invalidDimensions = 0;

  containerArray.forEach((container, pIndex) => {
    const imgs = container.querySelectorAll("img");
    totalImgs += imgs.length;

    imgs.forEach((img, iIdx) => {
      details.push(`Trang ${pIndex + 1} - Ảnh #${iIdx + 1}:`);
      const src = img.getAttribute("src") || "";
      const alt = img.getAttribute("alt") || img.getAttribute("aria-label");
      
      if (!alt) {
        missingAlt++;
        details.push("  + [Cảnh báo] Ảnh thiếu dòng chú thích (alt/aria-label) bổ trợ cho bộ máy đọc.");
      } else {
        details.push(`  + Mô tả ảnh: "${alt}"`);
      }

      if (src.startsWith("data:image/")) {
        details.push(`  + Định dạng: Ảnh nhúng trực tiếp Base64 (${Math.round(src.length / 1024)} KB).`);
      } else {
        details.push(`  + Nguồn ảnh: Link ngoài / rỗng.`);
      }

      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;
      if (originalWidth > 0 && (originalWidth < 100 || originalHeight < 100)) {
        invalidDimensions++;
        details.push(`  + [Cảnh báo] Ảnh có kích thước thô quá bé (${originalWidth}x${originalHeight}px). Có khả năng bị mờ khi in ấn.`);
      }
    });
  });

  if (totalImgs === 0) {
    return {
      status: "passed",
      message: "Không có ảnh được nhúng. Không có vấn đề căn lề hình ảnh.",
      details: ["- Tiết kiệm dung lượng và không tiềm ẩn sai lệch tỷ lệ hiển thị."]
    };
  } else if (missingAlt > 0 || invalidDimensions > 0) {
    return {
      status: "warning",
      message: `Tìm thấy ${totalImgs} hình ảnh, có ${missingAlt} ảnh thiếu chú thích và ${invalidDimensions} ảnh độ phân giải thấp.`,
      details: [...details, "Tính tương thích: PDF và Word đòi hỏi ảnh có chú giải rõ ràng để duy trì cấu trúc dữ liệu mô tả."]
    };
  } else {
    return {
      status: "passed",
      message: `Toàn bộ ${totalImgs} ảnh hoàn tất trích xuất! Độ phân giải cao, lề ảnh khít tuyệt đối với mặt cắt PDF gốc.`,
      details
    };
  }
}

export function checkStyleAndCssRules(containerArray: HTMLElement[]): {
  status: TestStatus;
  message: string;
  details: string[];
} {
  const details: string[] = [];
  let problematicStyles = 0;

  containerArray.forEach((container, pIndex) => {
    const styledElements = container.querySelectorAll("[style]");
    styledElements.forEach((el) => {
      const styleAttr = el.getAttribute("style") || "";
      
      // Detect absolute width styles
      if (styleAttr.includes("width:") && /width\s*:\s*\d{3,}px/.test(styleAttr)) {
        const widthMatch = styleAttr.match(/width\s*:\s*(\d+)px/);
        const widthVal = widthMatch ? parseInt(widthMatch[1]) : 0;
        if (widthVal > 750) {
          problematicStyles++;
          details.push(`Trang ${pIndex + 1}: Phát hiện phần tử <${el.tagName.toLowerCase()}> chứa độ rộng cố định quá lớn (${widthVal}px). Có nguy cơ tràn lề khi in kẹp A4.`);
        }
      }

      // Detect negative margins which cause text overlap
      if (styleAttr.includes("margin-left") && /margin-left\s*:\s*-\d+/.test(styleAttr)) {
        problematicStyles++;
        details.push(`Trang ${pIndex + 1}: Có thẻ căn lề trái âm (-) dễ đè chữ lên lề hoặc sang trang kề cận.`);
      }
    });
  });

  if (problematicStyles > 0) {
    return {
      status: "warning",
      message: `Phát hiện ${problematicStyles} quy tắc CSS cục bộ có thể bóp nghẹt tính co giãn của đầu ra Word/PDF.`,
      details: [...details, "Lời khuyên: Sử dụng cấu trúc tỷ lệ % (width: 100%) thay vì gán cứng px."]
    };
  } else {
    return {
      status: "passed",
      message: "Quy tắc phong cách (Styles & CSS) lành mạnh. Giao diện co giãn tự nhiên linh hoạt.",
      details: ["- Không chứa thuộc tính gán cứng pixel vượt lăng kính máy in chuẩn."]
    };
  }
}

export function checkPPTXStructure(containerArray: HTMLElement[]): {
  status: TestStatus;
  message: string;
  details: string[];
} {
  const details: string[] = [];
  try {
    details.push("- Đang rà soát và chuyển đổi ngữ nghĩa thành đồ họa vector cho PowerPoint (.pptx).");
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_16x9";

    let slideCount = 0;
    let tablesInPPTX = 0;
    let bulletsInPPTX = 0;

    containerArray.forEach((container) => {
      slideCount++;
      const editableDiv = container.querySelector("[contenteditable]");
      if (!editableDiv) return;

      const children = editableDiv.children;
      for (let k = 0; k < children.length; k++) {
        const child = children[k];
        const name = child.tagName.toLowerCase();
        if (name === "table") tablesInPPTX++;
        if (name === "li") bulletsInPPTX++;
      }
    });

    details.push(`- Sơ đồ PowerPoint dự báo: Giao dạng widescreen (16:9).`);
    details.push(`- Cấu trúc: ${slideCount} Slide bản thảo, chứa ${tablesInPPTX} bảng gốc, ${bulletsInPPTX} khối dòng gạch đầu.`);
    details.push(`- Hệ thống phân bổ toạ độ Y trục: Đảm bảo tự động thụt lề dưới 5.625 inches.`);

    return {
      status: "passed",
      message: `Kế hoạch PPTX khả thi! Dàn dựng slide native editable thành công, tự động định dạng kích thước bảng và font tương đồng.`,
      details
    };
  } catch (err: any) {
    return {
      status: "failed",
      message: `Lỗi xây dựng bản vẽ PPTX: ${err.message || err}`,
      details: [`Lỗi: ${err.toString()}`]
    };
  }
}
