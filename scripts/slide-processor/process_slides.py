import re
import os
import base64

# We will read from the backup file to avoid the messed up slide content of the previous run
vn_path = r"C:\Users\ttha\Downloads\06022026\AI_Workshop_VN_backup.html"
web_path = r"C:\Users\ttha\Downloads\06022026\AI_Workshop_Web.html"
images_dir = r"C:\Users\ttha\Downloads\06022026\images"
output_path = r"C:\Users\ttha\Downloads\06022026\AI_Workshop_VN.html"

# 1. Load PAGES from Web HTML
with open(web_path, 'r', encoding='utf-8') as f:
    web_content = f.read()

pages_match = re.search(r'const PAGES\s*=\s*\[(.*?)\];\s*const total\s*=', web_content, re.DOTALL)
if not pages_match:
    pages_match = re.search(r'const PAGES\s*=\s*\[(.*?)\];\s*let current\s*=', web_content, re.DOTALL)

pages = []
if pages_match:
    pages_block = pages_match.group(1)
    pages = re.findall(r'"(data:image/jpeg;base64,.*?)"', pages_block)
print(f"Loaded {len(pages)} base64 page images from Web HTML.")

# Helper to load cropped image and convert to base64 data URI
def get_base64_img(filename):
    path = os.path.join(images_dir, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Cropped image not found: {path}")
    with open(path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    return f"data:image/png;base64,{encoded_string}"

# Load cropped images as base64
img_cache = {}
try:
    img_cache['p58_img2'] = get_base64_img("page_58_img_2.png")
    img_cache['p59_img1'] = get_base64_img("page_59_img_1.png")
    img_cache['p59_img2'] = get_base64_img("page_59_img_2.png")
    img_cache['p59_img3'] = get_base64_img("page_59_img_3.png")
    img_cache['p60_img1'] = get_base64_img("page_60_img_1.png")
    img_cache['p60_img2'] = get_base64_img("page_60_img_2.png")
    img_cache['p60_img3'] = get_base64_img("page_60_img_3.png")
    img_cache['p61_img1'] = get_base64_img("page_61_img_1.png")
    img_cache['p61_img2'] = get_base64_img("page_61_img_2.png")
    img_cache['p61_img3'] = get_base64_img("page_61_img_3.png")
    img_cache['p65_img1'] = get_base64_img("page_65_img_1.png")
    img_cache['p66_img2'] = get_base64_img("page_66_img_2.png")
    img_cache['p68_img2'] = get_base64_img("page_68_img_2.png")
    img_cache['p71_img2'] = get_base64_img("page_71_img_2.png")
    img_cache['p3_img1'] = get_base64_img("page_3_img_1.png")
    img_cache['p7_img1'] = get_base64_img("page_7_img_1.png")
    # Newly extracted crops for slides 2, 6, 8, 13, 14
    img_cache['p2_img1'] = get_base64_img("page_2_img_1.png")
    img_cache['p6_img1'] = get_base64_img("page_6_img_1.png")
    img_cache['p8_img1'] = get_base64_img("page_8_img_1.png")
    img_cache['p13_img1'] = get_base64_img("page_13_img_1.png")
    img_cache['p14_img1'] = get_base64_img("page_14_img_1.png")
    print("All cropped images loaded successfully.")
except Exception as e:
    print(f"Error loading cropped images: {e}")
    exit(1)

# 2. Load Backup VN HTML
with open(vn_path, 'r', encoding='utf-8') as f:
    vn_content = f.read()

# Extract SLIDES_HTML block
slides_match = re.search(r'(const SLIDES_HTML\s*=\s*\[)(.*?)(\];\s*(?:const total|let current)\s*=)', vn_content, re.DOTALL)
if not slides_match:
    print("Could not find SLIDES_HTML in VN HTML")
    exit(1)

prefix = slides_match.group(1)
slides_block = slides_match.group(2)
suffix = slides_match.group(3)

# Parse slides list using raw parser and unescaper
def parse_slides_raw(block):
    slides = []
    current_slide = []
    in_slide = False
    i = 0
    while i < len(block):
        char = block[i]
        if char == '`':
            is_escaped = False
            if i > 0 and block[i-1] == '\\':
                bs_count = 0
                j = i - 1
                while j >= 0 and block[j] == '\\':
                    bs_count += 1
                    j -= 1
                if bs_count % 2 == 1:
                    is_escaped = True
            
            if is_escaped:
                current_slide.append(char)
            else:
                if in_slide:
                    slides.append("".join(current_slide))
                    current_slide = []
                    in_slide = False
                else:
                    in_slide = True
        else:
            if in_slide:
                current_slide.append(char)
        i += 1
    return slides

def unescape_template_literal(s):
    res = []
    i = 0
    while i < len(s):
        if s[i] == '\\' and i + 1 < len(s):
            next_char = s[i+1]
            if next_char == '`':
                res.append('`')
            elif next_char == '\\':
                res.append('\\')
            elif next_char == '$':
                res.append('$')
            elif next_char == 'n':
                res.append('\n')
            elif next_char == 't':
                res.append('\t')
            elif next_char == 'r':
                res.append('\r')
            else:
                res.append('\\' + next_char)
            i += 2
        else:
            res.append(s[i])
            i += 1
    return "".join(res)

raw_slides = parse_slides_raw(slides_block)
new_slides = [unescape_template_literal(s) for s in raw_slides]
print(f"Smart parsed slides count: {len(new_slides)}")

# 3. Now let's loop through the 77 slides and replace placeholder slides and image descs with base64 images
for idx, slide in enumerate(new_slides):
    # Check if this is a placeholder slide
    trang_match = re.search(r'Trang\s*(\d+)\s*\(Chỉ có hình ảnh', slide)
    if trang_match:
        p_num = int(trang_match.group(1))
        # Replacement HTML with full page base64 image
        # PAGES array is 0-based, so page p_num is PAGES[p_num-1]
        img_base64 = pages[p_num - 1]
        new_slides[idx] = f"""<div class="slide-container w-full h-full flex items-center justify-center bg-[#0b0b0f] p-1">
  <img src="{img_base64}" class="max-w-full max-h-full object-contain rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.6)]" alt="Slide {p_num}">
</div>"""
        print(f"Replaced placeholder for page {p_num} (Slide {idx+1}) with base64 slide image.")

# Let's do replacements for image description slides:
for i, slide in enumerate(new_slides):
    # Slide 58 (index 57) -> page_58_img_2.png  (Robot eating traditional food)
    if 'Ảnh minh họa: Robot đang ăn món ăn truyền thống' in slide:
        new_slides[i] = slide.replace(
            '<div class="w-full h-64 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 text-xl p-4 text-center">\n          Ảnh minh họa: Robot đang ăn món ăn truyền thống\n        </div>',
            f'<div class="w-full h-64 rounded-lg overflow-hidden flex items-center justify-center shadow-lg"><img src="{img_cache["p58_img2"]}" class="max-w-full max-h-full object-contain rounded-lg"></div>'
        )
        print(f"Replaced image desc in Slide {i+1} (Robot eating traditional food).")

    # Slide 2 (index 1) -> page_2_img_1.png (QR code orange box)
    if 'Ảnh chụp màn hình: Mã QR' in slide and 'bg-[#ff6f00]' in slide:
        old_block = """<div class="w-64 h-64 md:w-80 md:h-80 bg-[#ff6f00] rounded-lg flex items-center justify-center shadow-lg mb-8">
      <div class="text-white text-xl font-semibold">
        Ảnh chụp màn hình: Mã QR
      </div>
    </div>"""
        new_block = f"""<div class="w-64 h-64 md:w-80 md:h-80 rounded-lg overflow-hidden flex items-center justify-center shadow-lg mb-8">
      <img src="{img_cache['p2_img1']}" class="max-w-full max-h-full object-contain">
    </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (QR code).")

    # Slide 3 (index 2) -> page_3_img_1.png (360i Interface UI)
    if 'Ảnh chụp màn hình: Giao diện 360i' in slide and 'aspect-video' in slide:
        old_block = """<div class="bg-[#1a1a2e] rounded-lg shadow-lg p-6 w-full max-w-2xl aspect-video flex flex-col justify-center items-center text-gray-300">
          <div class="text-xl font-semibold mb-4">Ảnh chụp màn hình: Giao diện 360i</div>
          <p class="text-center text-sm">
            Hiển thị giao diện người dùng của 360i với các tùy chọn trò chuyện, lịch sử và danh sách các mô hình LLM có sẵn (Qwen, Gemini, ChatGPT, Grok, Kimi, Claude Haiku).
          </p>
          <p class="mt-4 text-xs text-gray-500">
            (Đây là một placeholder, không phải hình ảnh thực tế)
          </p>
        </div>"""
        new_block = f"""<div class="rounded-lg overflow-hidden shadow-lg w-full max-w-2xl">
          <img src="{img_cache['p3_img1']}" class="w-full h-auto object-contain">
        </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (360i Interface UI).")

    # Slide 6 (index 5) -> page_6_img_1.png (360i chat screenshot - enterprise services)
    if 'Ảnh chụp màn hình: Giao diện trò chuyện của 360i' in slide:
        old_block = """<div class="bg-[#2a2a4a] rounded-lg p-6 shadow-lg flex flex-col items-center justify-center h-64">
          <div class="text-5xl text-blue-400 mb-4">
            <i class="fas fa-cogs"></i>
          </div>
          <p class="text-lg text-gray-300 text-center">
            Ảnh chụp màn hình: Giao diện trò chuyện của 360i với các câu hỏi và câu trả lời về dịch vụ doanh nghiệp.
          </p>
        </div>"""
        new_block = f"""<div class="rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
          <img src="{img_cache['p6_img1']}" class="w-full h-full object-cover">
        </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (360i enterprise chat).")

    # Slide 7 (index 6) -> page_7_img_1.png (360i Agent interface)
    if 'Ảnh chụp màn hình: Giao diện 360i' in slide and 'min-h-[400px]' in slide:
        old_block = """<div class="bg-[#2a2a4a] rounded-lg p-6 shadow-lg flex flex-col items-center justify-center min-h-[400px]">
          <div class="text-white text-2xl font-semibold mb-4">Ảnh chụp màn hình: Giao diện 360i</div>
          <p class="text-gray-400 text-center">
            Giao diện người dùng của 360i, hiển thị các tính năng trò chuyện, thêm tác nhân và các công cụ khác.
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-4">
            <div class="bg-[#3a3a5a] text-white px-4 py-2 rounded-full text-sm">New chat</div>
            <div class="bg-[#3a3a5a] text-white px-4 py-2 rounded-full text-sm">Add Agent</div>
            <div class="bg-[#3a3a5a] text-white px-4 py-2 rounded-full text-sm">Vitruvius</div>
            <div class="bg-[#3a3a5a] text-white px-4 py-2 rounded-full text-sm">Material Specifier</div>
            <div class="bg-[#3a3a5a] text-white px-4 py-2 rounded-full text-sm">Batman</div>
          </div>
        </div>"""
        new_block = f"""<div class="rounded-lg overflow-hidden shadow-lg flex items-center justify-center min-h-[300px]">
          <img src="{img_cache['p7_img1']}" class="w-full h-full object-cover">
        </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (360i Agent interface).")

    # Slide 8 (index 7) -> page_8_img_1.png (360i widget on desktop)
    if 'Ảnh chụp màn hình: Widget 360i trên màn hình nền' in slide:
        old_block = """<div class="w-full h-full bg-[#2a2a72] rounded-lg flex items-center justify-center relative overflow-hidden">
        <div class="absolute top-1/3 left-1/4 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-20 h-20 rounded-full border-2 border-orange-400 text-orange-400 text-lg font-semibold">
          360i
        </div>
        <div class="absolute bottom-0 left-0 w-full h-16 bg-gray-800 flex items-center px-4">
          <div class="flex items-center bg-gray-700 rounded-md px-3 py-1 text-gray-300 text-sm">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            Search
          </div>
          <!-- Placeholder for other taskbar icons -->
          <div class="flex-grow"></div>
          <div class="flex space-x-2">
            <div class="w-6 h-6 bg-gray-600 rounded-sm"></div>
            <div class="w-6 h-6 bg-gray-600 rounded-sm"></div>
            <div class="w-6 h-6 bg-gray-600 rounded-sm"></div>
          </div>
        </div>
      </div>"""
        new_block = f"""<div class="w-full h-full rounded-lg overflow-hidden">
        <img src="{img_cache['p8_img1']}" class="w-full h-full object-cover">
      </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (360i widget on desktop).")

    # Slide 13 (index 12) -> page_13_img_1.png (woman dancing)
    if 'Ảnh chụp màn hình: Một người phụ nữ đang nhảy múa vui vẻ' in slide:
        old_block = """<div class="w-3/4 h-3/4 bg-gray-700 rounded-lg flex items-center justify-center text-gray-300 text-xl">
        Ảnh chụp màn hình: Một người phụ nữ đang nhảy múa vui vẻ
      </div>"""
        new_block = f"""<div class="w-3/4 h-3/4 rounded-lg overflow-hidden flex items-center justify-center">
        <img src="{img_cache['p13_img1']}" class="max-w-full max-h-full object-contain">
      </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (Woman dancing).")

    # Slide 14 (index 13) -> page_14_img_1.png (two people obstacle course)
    if 'Ảnh chụp màn hình: Hai người đang cố gắng vượt qua chướng ngại vật' in slide:
        old_block = """<div class="flex justify-center items-center w-full h-[400px] bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div class="text-gray-400 text-lg text-center p-4">
        Ảnh chụp màn hình: Hai người đang cố gắng vượt qua chướng ngại vật trên đường đua, một người đang đẩy một chiếc thang.
      </div>
    </div>"""
        new_block = f"""<div class="flex justify-center items-center w-full h-[400px] rounded-lg shadow-lg overflow-hidden">
      <img src="{img_cache['p14_img1']}" class="w-full h-full object-cover">
    </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (Obstacle course).")

    # Slide 68 (index 67) -> page_59_img_1, 2, 3
    if 'Ảnh chụp màn hình: Tòa nhà học viện với cầu nối' in slide:
        old_block = """    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
      <span class="text-gray-400 text-xl text-center p-4">Ảnh chụp màn hình: Tòa nhà học viện với cầu nối</span>
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
      <span class="text-gray-400 text-xl text-center p-4">Ảnh chụp màn hình: Bên trong cầu nối với khu vực tiếp khách</span>
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
      <span class="text-gray-400 text-xl text-center p-4">Ảnh chụp màn hình: Chi tiết vật liệu và kết nối</span>
    </div>"""
        
        new_block = f"""    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-40">
      <img src="{img_cache["p59_img1"]}" class="w-full h-full object-cover">
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-40">
      <img src="{img_cache["p59_img2"]}" class="w-full h-full object-cover">
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-40">
      <img src="{img_cache["p59_img3"]}" class="w-full h-full object-cover">
    </div>"""
        temp = slide.replace(old_block, new_block)
        temp = temp.replace('p-16', 'p-8').replace('gap-8', 'gap-4').replace('text-5xl', 'text-3xl').replace('gap-12', 'gap-6').replace('text-2xl', 'text-xl').replace('text-lg', 'text-sm').replace('space-y-4', 'space-y-2').replace('mt-12', 'mt-4').replace('h-64', 'h-40')
        new_slides[i] = temp
        print(f"Replaced image descs in Slide {i+1} (Crystal Bridge Concept) and scaled layout.")

    # Slide 69 (index 68) -> page_60_img_1, 2, 3
    if 'Ảnh chụp màn hình: Toàn cảnh kiến trúc bên ngoài của Học viện Hàng không Singapore' in slide:
        old_block = """  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
    <div class="bg-gray-800 rounded-lg flex items-center justify-center h-48 text-gray-400 text-sm p-4 text-center">
      Ảnh chụp màn hình: Toàn cảnh kiến trúc bên ngoài của Học viện Hàng không Singapore
    </div>
    <div class="bg-gray-800 rounded-lg flex items-center justify-center h-48 text-gray-400 text-sm p-4 text-center">
      Ảnh chụp màn hình: Nội thất giếng trời trung tâm với nhiều tầng và cầu thang
    </div>
    <div class="bg-gray-800 rounded-lg flex items-center justify-center h-48 text-gray-400 text-sm p-4 text-center">
      Ảnh chụp màn hình: Chi tiết mặt tiền tòa nhà với các lam chắn dọc
    </div>
  </div>"""
        
        new_block = f"""  <div class="grid grid-cols-3 gap-4 mt-4">
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-32">
      <img src="{img_cache["p60_img1"]}" class="w-full h-full object-cover">
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-32">
      <img src="{img_cache["p60_img2"]}" class="w-full h-full object-cover">
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-32">
      <img src="{img_cache["p60_img3"]}" class="w-full h-full object-cover">
    </div>
  </div>"""
        temp = slide.replace(old_block, new_block)
        temp = temp.replace('p-10', 'p-6').replace('gap-6', 'gap-3').replace('text-4xl', 'text-2xl').replace('gap-8', 'gap-4').replace('text-xl', 'text-lg').replace('gap-4', 'gap-2').replace('text-lg', 'text-sm').replace('space-y-6', 'space-y-2').replace('mt-8', 'mt-4').replace('h-48', 'h-32')
        new_slides[i] = temp
        print(f"Replaced image descs in Slide {i+1} (Integrated Spine Concept) and scaled layout.")

    # Slide 70 (index 69) -> page_61_img_1, 2, 3
    if 'Ảnh chụp màn hình: Kiến trúc sinh học' in slide:
        old_block = """  <div class="grid grid-cols-3 gap-6 mt-12">
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
      <span class="text-gray-400 text-xl">Ảnh chụp màn hình: Kiến trúc sinh học</span>
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
      <span class="text-gray-400 text-xl">Ảnh chụp màn hình: Không gian học tập</span>
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-64">
      <span class="text-gray-400 text-xl">Ảnh chụp màn hình: Chi tiết kiến trúc</span>
    </div>
  </div>"""
        
        new_block = f"""  <div class="grid grid-cols-3 gap-6 mt-4">
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-40">
      <img src="{img_cache["p61_img1"]}" class="w-full h-full object-cover">
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-40">
      <img src="{img_cache["p61_img2"]}" class="w-full h-full object-cover">
    </div>
    <div class="bg-gray-800 rounded-lg overflow-hidden shadow-lg flex items-center justify-center h-40">
      <img src="{img_cache["p61_img3"]}" class="w-full h-full object-cover">
    </div>
  </div>"""
        temp = slide.replace(old_block, new_block)
        temp = temp.replace('p-16', 'p-8').replace('gap-8', 'gap-4').replace('text-5xl', 'text-3xl').replace('gap-12', 'gap-6').replace('text-2xl', 'text-xl').replace('gap-4', 'gap-2').replace('text-lg', 'text-sm').replace('space-y-6', 'space-y-2').replace('mt-12', 'mt-4').replace('h-64', 'h-40')
        new_slides[i] = temp
        print(f"Replaced image descs in Slide {i+1} (Biophilic Pavilions Concept) and scaled layout.")

    # Slide 74 (index 73) -> page_65_img_1.png
    if 'Ảnh chụp màn hình: Robot trên bãi biển lúc hoàng hôn' in slide:
        old_block = """  <div class="w-full md:w-1/2 flex items-center justify-center p-4">
    <div class="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
      <div class="text-gray-400 text-center p-4">
        <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
        <p>Ảnh chụp màn hình: Robot trên bãi biển lúc hoàng hôn</p>
      </div>
    </div>
  </div>"""
        
        new_block = f"""  <div class="w-full md:w-1/2 flex items-center justify-center p-4">
    <div class="w-full h-full rounded-lg overflow-hidden flex items-center justify-center shadow-lg bg-gray-800">
      <img src="{img_cache["p65_img1"]}" class="max-w-full max-h-full object-contain rounded-lg">
    </div>
  </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (Robot on beach).")

    # Slide 75 (index 74) -> page_66_img_2.png
    if 'Ảnh minh họa: Robot đang sửa chữa ô tô' in slide:
        old_block = """    <div class="flex items-center justify-center">
      <div class="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center p-4 shadow-lg">
        <span class="text-gray-400 text-xl text-center">Ảnh minh họa: Robot đang sửa chữa ô tô</span>
      </div>
    </div>"""
        
        new_block = f"""    <div class="flex items-center justify-center shadow-lg rounded-lg">
      <div class="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center p-4 shadow-lg">
        <img src="{img_cache["p66_img2"]}" class="max-w-full max-h-full object-contain rounded-lg">
      </div>
    </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (Robot repairing car).")

    # Slide 77 (index 76) -> page_68_img_2.png
    if 'Ảnh chụp màn hình: Robot chiến đấu trong môi trường đô thị' in slide:
        old_block = """    <div class="flex items-center justify-center">
      <div class="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center p-4">
        <span class="text-gray-400 text-lg text-center">Ảnh chụp màn hình: Robot chiến đấu trong môi trường đô thị</span>
      </div>
    </div>"""
        
        new_block = f"""    <div class="flex items-center justify-center shadow-lg rounded-lg">
      <div class="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center p-4">
        <img src="{img_cache["p68_img2"]}" class="max-w-full max-h-full object-contain rounded-lg">
      </div>
    </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (Robot fighting).")

    # Slide 80 (index 79) -> page_71_img_2.png
    if 'Ảnh chụp màn hình: Hàng ngũ robot với cờ Malaysia trên ngực' in slide:
        old_block = """    <div class="flex items-center justify-center">
      <div class="w-full h-64 md:h-full bg-gray-800 rounded-lg flex items-center justify-center text-gray-400 text-xl p-4">
        Ảnh chụp màn hình: Hàng ngũ robot với cờ Malaysia trên ngực
      </div>
    </div>"""
        
        new_block = f"""    <div class="flex items-center justify-center shadow-lg rounded-lg">
      <div class="w-full h-64 md:h-full bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
        <img src="{img_cache["p71_img2"]}" class="max-w-full max-h-full object-contain rounded-lg">
      </div>
    </div>"""
        new_slides[i] = slide.replace(old_block, new_block)
        print(f"Replaced image desc in Slide {i+1} (Robots with Malaysian flag).")

    # Replacement for Online Placeholders (via.placeholder.com) in Slide 4 (index 3)
    if 'https://via.placeholder.com/600x300?text=Ảnh+chụp+màn+hình+giao+diện+360i' in slide:
        new_slides[i] = slide.replace(
            'https://via.placeholder.com/600x300?text=Ảnh+chụp+màn+hình+giao+diện+360i',
            img_cache['p3_img1']
        ).replace(
            'https://via.placeholder.com/600x200?text=Ảnh+kết+xuất+từ+360i',
            img_cache['p7_img1']
        )
        print(f"Replaced via.placeholder online images in Slide {i+1}.")

# 4. Save the modified slides block back into the file content
def escape_template_literal(s):
    res = []
    i = 0
    while i < len(s):
        char = s[i]
        if char == '\\':
            res.append('\\\\')
        elif char == '`':
            res.append('\\`')
        elif char == '$' and i + 1 < len(s) and s[i+1] == '{':
            res.append('\\$')
        else:
            res.append(char)
        i += 1
    return "".join(res)

slides_joined = ",\n  ".join([f"`{escape_template_literal(s)}`" for s in new_slides])
new_vn_content = vn_content[:slides_match.start(2)] + slides_joined + vn_content[slides_match.end(2):]

# Save updated HTML file
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(new_vn_content)

print(f"Successfully wrote modified VN HTML to {output_path}")
