import { AIParsedDocument } from "../types";

// ─────────────────────────────────────────────────────────
// 12 Professional Document Templates
// ─────────────────────────────────────────────────────────

export const PRESET_TEMPLATES: AIParsedDocument[] = [
  // ─── 1. Blank Document ────────────────────────────────
  {
    title: "Tài liệu mới",
    description: "Bắt đầu soạn thảo tài liệu từ đầu.",
    theme: "corporate",
    blocks: [
      {
        id: "t1-h1",
        type: "heading",
        content: "Tiêu đề Tài liệu",
        meta: { level: 1 },
      },
      {
        id: "t1-p1",
        type: "paragraph",
        content: "Nhập nội dung của bạn tại đây. Sử dụng thanh công cụ phía trên để định dạng văn bản.",
      },
    ],
  },

  // ─── 2. Business Report ───────────────────────────────
  {
    title: "Báo cáo Kinh doanh Quý",
    description: "Mẫu báo cáo kinh doanh hàng quý chuyên nghiệp.",
    theme: "corporate",
    blocks: [
      { id: "t2-h1", type: "heading", content: "BÁO CÁO KINH DOANH QUÝ I/2025", meta: { level: 1 } },
      { id: "t2-meta", type: "paragraph", content: "<em>Ban hành ngày: 01/04/2025 | Đơn vị: Phòng Kinh doanh | Người lập: [Tên]</em>" },
      { id: "t2-pb1", type: "page-break", content: "" },
      { id: "t2-h2", type: "heading", content: "I. Tổng quan Kết quả Kinh doanh", meta: { level: 2 } },
      { id: "t2-p1", type: "paragraph", content: "Trong quý I/2025, công ty đã đạt được những kết quả đáng ghi nhận. Tổng doanh thu tăng <strong>23% so với cùng kỳ năm trước</strong>, vượt mục tiêu đề ra. Các hoạt động kinh doanh cốt lõi tiếp tục phát triển ổn định, đặc biệt ở mảng dịch vụ công nghệ." },
      {
        id: "t2-callout1",
        type: "callout",
        content: "✅ Điểm nổi bật: Doanh thu Q1/2025 đạt 4.2 tỷ đồng, tăng 23% so với Q1/2024. Lợi nhuận ròng đạt 850 triệu đồng.",
        meta: { calloutType: "success" },
      },
      { id: "t2-h3", type: "heading", content: "II. Số liệu Chi tiết", meta: { level: 2 } },
      {
        id: "t2-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "Hạng mục" }, { value: "Q1/2024 (triệu)" }, { value: "Q1/2025 (triệu)" }, { value: "Tăng trưởng (%)" }],
          [{ value: "Doanh thu dịch vụ" }, { value: "1800" }, { value: "2350" }, { value: "30.6%" }],
          [{ value: "Doanh thu sản phẩm" }, { value: "1620" }, { value: "1850" }, { value: "14.2%" }],
          [{ value: "Doanh thu khác" }, { value: "200" }, { value: "0" }, { value: "0" }],
          [{ value: "Tổng doanh thu" }, { value: "", formula: "=SUM(B2:B4)" }, { value: "", formula: "=SUM(C2:C4)" }, { value: "23.0%" }],
        ],
      },
      { id: "t2-chart1", type: "chart", content: "", meta: { chartType: "bar", chartDataKeys: ["Hạng mục", "Q1/2024 (triệu)", "Q1/2025 (triệu)"] } },
      { id: "t2-h4", type: "heading", content: "III. Kế hoạch Quý tiếp theo", meta: { level: 2 } },
      { id: "t2-p2", type: "paragraph", content: "Dựa trên kết quả đạt được, công ty đặt mục tiêu tăng trưởng <strong>25% trong Q2/2025</strong>. Trọng tâm sẽ tập trung vào mở rộng thị phần ở khu vực miền Nam và phát triển sản phẩm mới.", meta: { bulletPoints: ["Mở rộng kênh phân phối miền Nam", "Ra mắt sản phẩm thế hệ mới", "Tuyển dụng 15 nhân sự kinh doanh", "Đầu tư hệ thống CRM"] } },
      { id: "t2-slide1", type: "slide", content: "Tổng quan Kết quả Q1/2025", meta: { slideBg: "indigo", layout: "bullets", bulletPoints: ["Doanh thu tăng 23% so với cùng kỳ", "Lợi nhuận ròng 850 triệu đồng", "3 hợp đồng lớn ký mới", "Mở rộng 2 thị trường mới"] } },
      { id: "t2-slide2", type: "slide", content: "Kế hoạch Q2/2025", meta: { slideBg: "emerald", layout: "two-columns", bulletPoints: ["Doanh thu mục tiêu: 5.2 tỷ", "15 nhân sự mới", "Mở rộng miền Nam", "CRM mới triển khai", "Sản phẩm v2 ra mắt", "Hội nghị khách hàng lớn"] } },
    ],
  },

  // ─── 3. Service Contract ─────────────────────────────
  {
    title: "Hợp đồng Dịch vụ Công nghệ",
    description: "Mẫu hợp đồng dịch vụ CNTT chuyên nghiệp.",
    theme: "minimalist",
    blocks: [
      { id: "t3-h1", type: "heading", content: "HỢP ĐỒNG DỊCH VỤ CÔNG NGHỆ THÔNG TIN", meta: { level: 1 } },
      { id: "t3-meta", type: "paragraph", content: "<strong>Số hợp đồng:</strong> HĐ-IT-2025-___<br/><strong>Ngày ký:</strong> ___ tháng ___ năm 2025<br/><strong>Địa điểm ký kết:</strong> TP. Hồ Chí Minh" },
      { id: "t3-h2", type: "heading", content: "Điều 1. Thông tin các bên tham gia", meta: { level: 2 } },
      { id: "t3-p1", type: "paragraph", content: "<strong>Bên A (Bên thuê dịch vụ):</strong><br/>Tên công ty: ___<br/>Địa chỉ: ___<br/>Người đại diện: ___<br/>Chức vụ: ___" },
      { id: "t3-p2", type: "paragraph", content: "<strong>Bên B (Bên cung cấp dịch vụ):</strong><br/>Tên công ty: ___<br/>Địa chỉ: ___<br/>Người đại diện: ___<br/>Chức vụ: ___" },
      { id: "t3-h3", type: "heading", content: "Điều 2. Phạm vi Công việc và Dịch vụ", meta: { level: 2 } },
      { id: "t3-p3", type: "paragraph", content: "Bên B cam kết cung cấp các dịch vụ công nghệ thông tin bao gồm:", meta: { bulletPoints: ["Phát triển phần mềm theo yêu cầu", "Bảo trì và nâng cấp hệ thống", "Tư vấn giải pháp công nghệ", "Hỗ trợ kỹ thuật 24/7"] } },
      { id: "t3-h4", type: "heading", content: "Điều 3. Báo giá và Thanh toán", meta: { level: 2 } },
      {
        id: "t3-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "STT" }, { value: "Hạng mục dịch vụ" }, { value: "Đơn vị" }, { value: "Số lượng" }, { value: "Đơn giá (VND)" }, { value: "Thành tiền (VND)" }],
          [{ value: "1" }, { value: "Phát triển ứng dụng web" }, { value: "Module" }, { value: "5" }, { value: "15000000" }, { value: "", formula: "=D2*E2" }],
          [{ value: "2" }, { value: "Bảo trì hệ thống" }, { value: "Tháng" }, { value: "12" }, { value: "3000000" }, { value: "", formula: "=D3*E3" }],
          [{ value: "3" }, { value: "Tư vấn và đào tạo" }, { value: "Buổi" }, { value: "4" }, { value: "5000000" }, { value: "", formula: "=D4*E4" }],
          [{ value: "" }, { value: "Tổng cộng (chưa VAT)" }, { value: "" }, { value: "" }, { value: "" }, { value: "", formula: "=SUM(F2:F4)" }],
          [{ value: "" }, { value: "VAT 10%" }, { value: "" }, { value: "" }, { value: "" }, { value: "", formula: "=F5*0.1" }],
          [{ value: "" }, { value: "Tổng thanh toán" }, { value: "" }, { value: "" }, { value: "" }, { value: "", formula: "=F5+F6" }],
        ],
      },
      {
        id: "t3-callout1",
        type: "callout",
        content: "⚠️ Lưu ý: Thanh toán thực hiện theo từng giai đoạn. Đợt 1: 30% khi ký hợp đồng. Đợt 2: 40% khi nghiệm thu từng phần. Đợt 3: 30% khi bàn giao hoàn chỉnh.",
        meta: { calloutType: "warning" },
      },
      { id: "t3-h5", type: "heading", content: "Điều 4. Điều khoản và Cam kết", meta: { level: 2 } },
      { id: "t3-p4", type: "paragraph", content: "Hợp đồng có hiệu lực từ ngày ký và chấm dứt khi các bên hoàn thành nghĩa vụ. Mọi tranh chấp được giải quyết theo quy định của pháp luật Việt Nam." },
    ],
  },

  // ─── 4. Project Plan ──────────────────────────────────
  {
    title: "Kế hoạch Dự án CNTT",
    description: "Mẫu kế hoạch triển khai dự án công nghệ thông tin.",
    theme: "modern",
    blocks: [
      { id: "t4-h1", type: "heading", content: "KẾ HOẠCH TRIỂN KHAI DỰ ÁN CÔNG NGHỆ", meta: { level: 1 } },
      { id: "t4-p1", type: "paragraph", content: "<strong>Tên dự án:</strong> ___<br/><strong>Thời gian:</strong> ___ - ___<br/><strong>Ngân sách:</strong> ___ triệu VND<br/><strong>Chủ dự án:</strong> ___" },
      { id: "t4-callout1", type: "callout", content: "🎯 Mục tiêu: Xây dựng hệ thống quản lý doanh nghiệp tích hợp, tự động hóa quy trình và nâng cao hiệu quả vận hành lên 40%.", meta: { calloutType: "info" } },
      { id: "t4-h2", type: "heading", content: "I. Phạm vi và Mục tiêu", meta: { level: 2 } },
      { id: "t4-p2", type: "paragraph", content: "Dự án tập trung vào các mục tiêu chiến lược sau:", meta: { bulletPoints: ["Số hóa toàn bộ quy trình quản lý nhân sự", "Xây dựng hệ thống báo cáo thời gian thực", "Tích hợp API với các hệ thống bên ngoài", "Đào tạo 50+ người dùng cuối"] } },
      { id: "t4-h3", type: "heading", content: "II. Timeline Dự án", meta: { level: 2 } },
      {
        id: "t4-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "Giai đoạn" }, { value: "Công việc chính" }, { value: "Thời gian" }, { value: "Ngân sách (triệu)" }, { value: "Trạng thái" }],
          [{ value: "Phase 1" }, { value: "Khảo sát & Thiết kế hệ thống" }, { value: "Tháng 1-2" }, { value: "150" }, { value: "Đang thực hiện" }],
          [{ value: "Phase 2" }, { value: "Phát triển Backend & API" }, { value: "Tháng 3-5" }, { value: "400" }, { value: "Chưa bắt đầu" }],
          [{ value: "Phase 3" }, { value: "Phát triển Frontend & UI" }, { value: "Tháng 4-6" }, { value: "300" }, { value: "Chưa bắt đầu" }],
          [{ value: "Phase 4" }, { value: "Kiểm thử & UAT" }, { value: "Tháng 7" }, { value: "100" }, { value: "Chưa bắt đầu" }],
          [{ value: "Phase 5" }, { value: "Go-live & Đào tạo" }, { value: "Tháng 8" }, { value: "50" }, { value: "Chưa bắt đầu" }],
          [{ value: "Tổng" }, { value: "" }, { value: "8 tháng" }, { value: "", formula: "=SUM(D2:D6)" }, { value: "" }],
        ],
      },
      { id: "t4-chart1", type: "chart", content: "", meta: { chartType: "bar", chartDataKeys: ["Giai đoạn", "Ngân sách (triệu)"] } },
      { id: "t4-slide1", type: "slide", content: "Kế hoạch Dự án CNTT 2025", meta: { slideBg: "indigo", layout: "title", bulletPoints: ["Tổng thời gian: 8 tháng | Ngân sách: 1 tỷ VND"] } },
      { id: "t4-slide2", type: "slide", content: "5 Giai đoạn Triển khai", meta: { slideBg: "slate", layout: "bullets", bulletPoints: ["Phase 1: Khảo sát & Thiết kế (T1-T2)", "Phase 2: Phát triển Backend (T3-T5)", "Phase 3: Phát triển Frontend (T4-T6)", "Phase 4: Kiểm thử & UAT (T7)", "Phase 5: Go-live & Đào tạo (T8)"] } },
    ],
  },

  // ─── 5. Meeting Minutes ───────────────────────────────
  {
    title: "Biên bản Cuộc họp",
    description: "Mẫu biên bản cuộc họp chuyên nghiệp.",
    theme: "minimalist",
    blocks: [
      { id: "t5-h1", type: "heading", content: "BIÊN BẢN CUỘC HỌP", meta: { level: 1 } },
      { id: "t5-p1", type: "paragraph", content: "<strong>Ngày họp:</strong> ___<br/><strong>Giờ bắt đầu:</strong> ___ | <strong>Giờ kết thúc:</strong> ___<br/><strong>Địa điểm:</strong> ___<br/><strong>Chủ trì:</strong> ___<br/><strong>Thư ký:</strong> ___" },
      { id: "t5-h2", type: "heading", content: "I. Thành phần tham dự", meta: { level: 2 } },
      {
        id: "t5-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "STT" }, { value: "Họ và Tên" }, { value: "Chức vụ / Đơn vị" }, { value: "Có mặt" }],
          [{ value: "1" }, { value: "" }, { value: "" }, { value: "✓" }],
          [{ value: "2" }, { value: "" }, { value: "" }, { value: "✓" }],
          [{ value: "3" }, { value: "" }, { value: "" }, { value: "✓" }],
        ],
      },
      { id: "t5-h3", type: "heading", content: "II. Nội dung Thảo luận", meta: { level: 2 } },
      { id: "t5-h4", type: "heading", content: "Vấn đề 1: [Tiêu đề vấn đề]", meta: { level: 3 } },
      { id: "t5-p2", type: "paragraph", content: "Tóm tắt nội dung thảo luận về vấn đề này..." },
      { id: "t5-callout1", type: "callout", content: "🔴 Vấn đề cấp thiết cần giải quyết ngay trong tuần này.", meta: { calloutType: "danger" } },
      { id: "t5-h5", type: "heading", content: "III. Quyết định và Giao việc", meta: { level: 2 } },
      {
        id: "t5-table2",
        type: "table",
        content: "",
        tableData: [
          [{ value: "STT" }, { value: "Nội dung công việc" }, { value: "Người phụ trách" }, { value: "Hạn hoàn thành" }, { value: "Trạng thái" }],
          [{ value: "1" }, { value: "" }, { value: "" }, { value: "" }, { value: "Mới" }],
          [{ value: "2" }, { value: "" }, { value: "" }, { value: "" }, { value: "Mới" }],
          [{ value: "3" }, { value: "" }, { value: "" }, { value: "" }, { value: "Mới" }],
        ],
      },
      { id: "t5-h6", type: "heading", content: "IV. Chữ ký xác nhận", meta: { level: 2 } },
      { id: "t5-p3", type: "paragraph", content: "<br/><strong>Chủ trì cuộc họp</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>Thư ký cuộc họp</strong><br/>(Ký và ghi rõ họ tên)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(Ký và ghi rõ họ tên)" },
    ],
  },

  // ─── 6. HR KPI Report ─────────────────────────────────
  {
    title: "Bảng đánh giá KPI Nhân viên",
    description: "Bảng tính đánh giá KPI nhân sự hàng tháng.",
    theme: "corporate",
    blocks: [
      { id: "t6-h1", type: "heading", content: "BẢNG ĐÁNH GIÁ KPI NHÂN VIÊN", meta: { level: 1 } },
      { id: "t6-p1", type: "paragraph", content: "<strong>Bộ phận:</strong> ___ | <strong>Kỳ đánh giá:</strong> Tháng ___/2025 | <strong>Người duyệt:</strong> ___" },
      {
        id: "t6-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "STT" }, { value: "Nhân viên" }, { value: "Chỉ tiêu doanh số (tr)" }, { value: "Kết quả thực tế (tr)" }, { value: "Tỉ lệ đạt (%)" }, { value: "Xếp loại" }],
          [{ value: "1" }, { value: "Nguyễn Văn A" }, { value: "100" }, { value: "118" }, { value: "", formula: "=D2/C2*100" }, { value: "Xuất sắc" }],
          [{ value: "2" }, { value: "Trần Thị B" }, { value: "100" }, { value: "95" }, { value: "", formula: "=D3/C3*100" }, { value: "Đạt" }],
          [{ value: "3" }, { value: "Lê Văn C" }, { value: "100" }, { value: "72" }, { value: "", formula: "=D4/C4*100" }, { value: "Không đạt" }],
          [{ value: "4" }, { value: "Phạm Thị D" }, { value: "100" }, { value: "105" }, { value: "", formula: "=D5/C5*100" }, { value: "Đạt" }],
          [{ value: "" }, { value: "Trung bình" }, { value: "", formula: "=AVERAGE(C2:C5)" }, { value: "", formula: "=AVERAGE(D2:D5)" }, { value: "", formula: "=AVERAGE(E2:E5)" }, { value: "" }],
        ],
      },
      { id: "t6-chart1", type: "chart", content: "", meta: { chartType: "bar", chartDataKeys: ["Nhân viên", "Chỉ tiêu doanh số (tr)", "Kết quả thực tế (tr)"] } },
      { id: "t6-callout1", type: "callout", content: "📌 Xếp loại: ≥ 110% = Xuất sắc | 90-109% = Đạt | < 90% = Không đạt. Lương thưởng được tính dựa trên hệ số xếp loại.", meta: { calloutType: "info" } },
    ],
  },

  // ─── 7. Marketing Proposal ────────────────────────────
  {
    title: "Đề xuất Chiến lược Marketing",
    description: "Mẫu đề xuất chiến lược marketing toàn diện.",
    theme: "modern",
    blocks: [
      { id: "t7-h1", type: "heading", content: "ĐỀ XUẤT CHIẾN LƯỢC MARKETING 2025", meta: { level: 1 } },
      { id: "t7-callout1", type: "callout", content: "🎯 Tầm nhìn: Tăng trưởng nhận thức thương hiệu 50% và doanh thu từ kênh digital 35% trong năm 2025.", meta: { calloutType: "info" } },
      { id: "t7-h2", type: "heading", content: "I. Phân tích Thị trường (SWOT)", meta: { level: 2 } },
      { id: "t7-p1", type: "paragraph", content: "Phân tích SWOT cho thấy vị thế cạnh tranh vững chắc với những cơ hội mở rộng đáng kể:", meta: { bulletPoints: ["Điểm mạnh: Thương hiệu uy tín, đội ngũ chuyên nghiệp", "Điểm yếu: Ngân sách marketing còn hạn chế", "Cơ hội: Thị trường số đang bùng nổ tại Việt Nam", "Thách thức: Cạnh tranh ngày càng gay gắt"] } },
      { id: "t7-h3", type: "heading", content: "II. Kênh và Ngân sách Marketing", meta: { level: 2 } },
      {
        id: "t7-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "Kênh Marketing" }, { value: "Ngân sách Q1 (tr)" }, { value: "Ngân sách Q2 (tr)" }, { value: "Mục tiêu KPI" }],
          [{ value: "Social Media (FB, TT, IG)" }, { value: "80" }, { value: "100" }, { value: "50K followers mới" }],
          [{ value: "Google Ads & SEO" }, { value: "60" }, { value: "80" }, { value: "CTR 5%, CPC < 5k" }],
          [{ value: "Content Marketing" }, { value: "40" }, { value: "50" }, { value: "30 bài/tháng" }],
          [{ value: "Email Marketing" }, { value: "15" }, { value: "15" }, { value: "Open rate 25%" }],
          [{ value: "Event & PR" }, { value: "100" }, { value: "120" }, { value: "3 events lớn" }],
          [{ value: "Tổng" }, { value: "", formula: "=SUM(B2:B6)" }, { value: "", formula: "=SUM(C2:C6)" }, { value: "" }],
        ],
      },
      { id: "t7-chart1", type: "chart", content: "", meta: { chartType: "pie", chartDataKeys: ["Kênh Marketing", "Ngân sách Q1 (tr)"] } },
      { id: "t7-slide1", type: "slide", content: "Chiến lược Marketing 2025", meta: { slideBg: "purple", layout: "title", bulletPoints: ["Tăng trưởng Digital & Brand Awareness"] } },
      { id: "t7-slide2", type: "slide", content: "5 Kênh Marketing Trọng tâm", meta: { slideBg: "indigo", layout: "two-columns", bulletPoints: ["Social Media", "Google Ads", "Content", "Email", "Event", "PR"] } },
    ],
  },

  // ─── 8. Invoice / Quote ───────────────────────────────
  {
    title: "Báo giá Dịch vụ",
    description: "Mẫu báo giá dịch vụ chuyên nghiệp.",
    theme: "minimalist",
    blocks: [
      { id: "t8-h1", type: "heading", content: "BÁO GIÁ DỊCH VỤ", meta: { level: 1 } },
      { id: "t8-p1", type: "paragraph", content: "<strong>Số báo giá:</strong> BG-2025-___<br/><strong>Ngày lập:</strong> ___<br/><strong>Hiệu lực:</strong> 30 ngày" },
      { id: "t8-p2", type: "paragraph", content: "<strong>Kính gửi:</strong> [Tên khách hàng / Công ty]<br/><strong>Địa chỉ:</strong> ___<br/><strong>Email:</strong> ___" },
      { id: "t8-callout1", type: "callout", content: "💼 Chúng tôi trân trọng gửi báo giá dịch vụ theo yêu cầu. Giá chưa bao gồm VAT 10% trừ khi có ghi chú khác.", meta: { calloutType: "info" } },
      {
        id: "t8-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "STT" }, { value: "Mô tả dịch vụ / Hàng hóa" }, { value: "ĐVT" }, { value: "SL" }, { value: "Đơn giá (VND)" }, { value: "Thành tiền (VND)" }],
          [{ value: "1" }, { value: "Thiết kế website doanh nghiệp" }, { value: "Dự án" }, { value: "1" }, { value: "25000000" }, { value: "", formula: "=D2*E2" }],
          [{ value: "2" }, { value: "Hosting & Domain (1 năm)" }, { value: "Năm" }, { value: "1" }, { value: "3600000" }, { value: "", formula: "=D3*E3" }],
          [{ value: "3" }, { value: "Tối ưu SEO cơ bản" }, { value: "Tháng" }, { value: "3" }, { value: "4500000" }, { value: "", formula: "=D4*E4" }],
          [{ value: "4" }, { value: "Bảo trì & Cập nhật nội dung" }, { value: "Tháng" }, { value: "6" }, { value: "2000000" }, { value: "", formula: "=D5*E5" }],
          [{ value: "" }, { value: "Cộng tiền hàng" }, { value: "" }, { value: "" }, { value: "" }, { value: "", formula: "=SUM(F2:F5)" }],
          [{ value: "" }, { value: "Thuế VAT (10%)" }, { value: "" }, { value: "" }, { value: "" }, { value: "", formula: "=F6*0.1" }],
          [{ value: "" }, { value: "TỔNG THANH TOÁN" }, { value: "" }, { value: "" }, { value: "" }, { value: "", formula: "=F6+F7" }],
        ],
      },
      { id: "t8-p3", type: "paragraph", content: "<strong>Phương thức thanh toán:</strong> Chuyển khoản ngân hàng<br/><strong>Số TK:</strong> ___<br/><strong>Ngân hàng:</strong> ___<br/><strong>Chủ TK:</strong> ___" },
    ],
  },

  // ─── 9. Startup Pitch Deck ────────────────────────────
  {
    title: "Startup Pitch Deck",
    description: "Bộ slide thuyết trình giới thiệu startup.",
    theme: "modern",
    blocks: [
      { id: "t9-slide1", type: "slide", content: "TÊN STARTUP", meta: { slideBg: "indigo", layout: "title", bulletPoints: ["Tagline ngắn gọn, súc tích, đáng nhớ"] } },
      { id: "t9-slide2", type: "slide", content: "Vấn đề chúng tôi giải quyết", meta: { slideBg: "slate", layout: "bullets", bulletPoints: ["🔴 Vấn đề 1: Mô tả ngắn gọn pain point", "🔴 Vấn đề 2: Tác động đến thị trường", "🔴 Vấn đề 3: Chi phí hiện tại của vấn đề", "📊 Thị trường tiềm năng: X tỷ USD"] } },
      { id: "t9-slide3", type: "slide", content: "Giải pháp của chúng tôi", meta: { slideBg: "emerald", layout: "bullets", bulletPoints: ["✅ Tính năng nổi bật 1", "✅ Tính năng nổi bật 2", "✅ Tính năng nổi bật 3", "🚀 Công nghệ độc quyền / Lợi thế cạnh tranh"] } },
      { id: "t9-slide4", type: "slide", content: "Mô hình Kinh doanh", meta: { slideBg: "purple", layout: "two-columns", bulletPoints: ["SaaS subscription", "Freemium model", "Enterprise licensing", "API monetization", "Revenue share", "Marketplace fees"] } },
      { id: "t9-slide5", type: "slide", content: "Traction & Milestones", meta: { slideBg: "slate", layout: "bullets", bulletPoints: ["📈 X,000 người dùng đăng ký", "💰 MRR đạt $X,XXX", "🤝 X đối tác chiến lược", "⭐ 4.8/5 đánh giá người dùng"] } },
      { id: "t9-slide6", type: "slide", content: "Đội ngũ Sáng lập", meta: { slideBg: "indigo", layout: "two-columns", bulletPoints: ["CEO - 10 năm kinh nghiệm", "CTO - Ex-Google engineer", "CMO - Ex-McKinsey", "COO - 8 năm startup", "Advisor 1", "Advisor 2"] } },
      { id: "t9-slide7", type: "slide", content: "Kế hoạch Gọi vốn", meta: { slideBg: "rose", layout: "bullets", bulletPoints: ["Vòng gọi vốn: Seed / Series A", "Số tiền cần: $X triệu USD", "Sử dụng vốn: 40% Product, 35% Marketing, 25% Ops", "Mục tiêu 18 tháng: 10x user growth"] } },
      { id: "t9-h1", type: "heading", content: "Tóm tắt Executive Summary", meta: { level: 1 } },
      { id: "t9-p1", type: "paragraph", content: "Đây là phần mô tả ngắn gọn về startup, sứ mệnh, vấn đề giải quyết và lý do vì sao bây giờ là thời điểm phù hợp nhất để đầu tư." },
      {
        id: "t9-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "Chỉ số" }, { value: "Hiện tại" }, { value: "12 tháng" }, { value: "24 tháng" }],
          [{ value: "Người dùng" }, { value: "1,000" }, { value: "10,000" }, { value: "100,000" }],
          [{ value: "MRR ($)" }, { value: "5,000" }, { value: "50,000" }, { value: "300,000" }],
          [{ value: "Đối tác B2B" }, { value: "3" }, { value: "25" }, { value: "100" }],
        ],
      },
    ],
  },

  // ─── 10. Financial Analysis ───────────────────────────
  {
    title: "Phân tích Tài chính Doanh nghiệp",
    description: "Mẫu báo cáo phân tích tài chính doanh nghiệp.",
    theme: "corporate",
    blocks: [
      { id: "t10-h1", type: "heading", content: "BÁO CÁO PHÂN TÍCH TÀI CHÍNH", meta: { level: 1 } },
      { id: "t10-p1", type: "paragraph", content: "<strong>Doanh nghiệp:</strong> ___ | <strong>Kỳ phân tích:</strong> Năm 2024-2025 | <strong>Người phân tích:</strong> ___" },
      { id: "t10-h2", type: "heading", content: "I. Kết quả Kinh doanh", meta: { level: 2 } },
      {
        id: "t10-table1",
        type: "table",
        content: "",
        tableData: [
          [{ value: "Chỉ tiêu" }, { value: "2023 (tỷ)" }, { value: "2024 (tỷ)" }, { value: "2025 KH (tỷ)" }, { value: "Tăng trưởng 24/23" }],
          [{ value: "Doanh thu thuần" }, { value: "45.2" }, { value: "56.8" }, { value: "70.0" }, { value: "", formula: "=(C2-B2)/B2*100" }],
          [{ value: "Giá vốn hàng bán" }, { value: "28.5" }, { value: "34.2" }, { value: "42.0" }, { value: "", formula: "=(C3-B3)/B3*100" }],
          [{ value: "Lợi nhuận gộp" }, { value: "", formula: "=B2-B3" }, { value: "", formula: "=C2-C3" }, { value: "", formula: "=D2-D3" }, { value: "", formula: "=(C4-B4)/B4*100" }],
          [{ value: "Chi phí hoạt động" }, { value: "8.3" }, { value: "10.1" }, { value: "12.0" }, { value: "", formula: "=(C5-B5)/B5*100" }],
          [{ value: "Lợi nhuận ròng" }, { value: "", formula: "=B4-B5" }, { value: "", formula: "=C4-C5" }, { value: "", formula: "=D4-D5" }, { value: "", formula: "=(C6-B6)/B6*100" }],
        ],
      },
      { id: "t10-chart1", type: "chart", content: "", meta: { chartType: "line", chartDataKeys: ["Chỉ tiêu", "2023 (tỷ)", "2024 (tỷ)", "2025 KH (tỷ)"] } },
      {
        id: "t10-callout2",
        type: "callout",
        content: "📊 Nhận xét: Doanh thu tăng trưởng mạnh 25.7% trong năm 2024. Biên lợi nhuận gộp được duy trì ở mức 39.8%, cho thấy hiệu quả kiểm soát chi phí tốt.",
        meta: { calloutType: "success" },
      },
    ],
  },
];
