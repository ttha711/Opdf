import re

vn_path = r"C:\Users\ttha\Downloads\06022026\AI_Workshop_VN.html"

with open(vn_path, 'r', encoding='utf-8') as f:
    vn_content = f.read()

# 1. Check slides count using parse_slides_smart
slides_match = re.search(r'(const SLIDES_HTML\s*=\s*\[)(.*?)(\];\s*(?:const total|let current)\s*=)', vn_content, re.DOTALL)
if not slides_match:
    print("Could not find SLIDES_HTML block.")
    exit(1)

slides_block = slides_match.group(2)

def parse_slides_smart(block):
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

slides = parse_slides_smart(slides_block)
print(f"Verified total smart-parsed slides in VN: {len(slides)}")

# 2. Check thumbnails count
thumbs_match = re.search(r'const THUMBNAILS\s*=\s*\[(.*?)\];\s*const SLIDES_HTML', vn_content, re.DOTALL)
if not thumbs_match:
    thumbs_match = re.search(r'const THUMBNAILS\s*=\s*\[(.*?)\];\s*let current\s*=', vn_content, re.DOTALL)

thumbs = []
if thumbs_match:
    thumbs_block = thumbs_match.group(1)
    thumbs = re.findall(r'"data:image/jpeg;base64,(.*?)"', thumbs_block)
print(f"Verified total thumbnails in VN: {len(thumbs)}")

# 3. Check for leftover placeholders
placeholders = ["Chỉ có hình ảnh", "Vui lòng tham khảo hình ảnh gốc", "via.placeholder.com"]
found_placeholders = 0
for idx, slide in enumerate(slides):
    for p in placeholders:
        if p in slide:
            print(f"WARNING: Leftover placeholder '{p}' found in Slide {idx+1}!")
            found_placeholders += 1

if found_placeholders == 0:
    print("SUCCESS: No placeholders or placeholder text found in the final slide list!")
else:
    print(f"FAILED: Found {found_placeholders} leftover placeholders.")

