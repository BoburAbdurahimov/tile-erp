import io
import os
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

def get_font(size=18, bold=False):
    # Try Windows fonts, fallback to PIL default
    font_paths = [
        ("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        ("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        ("C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf"),
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def render_excel_table_image(
    title: str,
    subtitle: str,
    headers: list,
    rows: list,
    col_alignments: list = None, # 'left', 'center', 'right'
    total_row: list = None,
    footer_notes: str = None,
    theme: str = "navy"
) -> io.BytesIO:
    """
    Renders a high-resolution, large-font, crystal clear Excel-style table image.
    Optimized for mobile Telegram screens.
    """
    themes = {
        "navy": {
            "header_bg": (15, 23, 42),       # #0F172A
            "header_text": (255, 255, 255),
            "title_bg": (30, 41, 59),        # #1E293B
            "title_text": (255, 255, 255),
            "sub_text": (148, 163, 184),     # #94A3B8
            "stripe_even": (255, 255, 255),
            "stripe_odd": (248, 250, 252),   # #F8FAFC
            "grid_border": (203, 213, 225),  # #CBD5E1
            "text_main": (15, 23, 42),       # #0F172A
            "total_bg": (241, 245, 249),     # #F1F5F9
            "total_text": (16, 185, 129),    # #10B981
            "accent": (37, 99, 235)          # #2563EB
        }
    }
    th = themes.get(theme, themes["navy"])

    # Extra Large, Clear Fonts for Mobile
    title_font = get_font(26, bold=True)
    sub_font = get_font(16, bold=False)
    header_font = get_font(18, bold=True)
    cell_font = get_font(17, bold=False)
    total_font = get_font(19, bold=True)
    footer_font = get_font(14, bold=False)

    num_cols = len(headers)
    if not col_alignments:
        col_alignments = ["left"] * num_cols

    # Calculate optimal column widths with generous padding
    temp_img = Image.new("RGB", (100, 100))
    temp_draw = ImageDraw.Draw(temp_img)

    col_widths = []
    for c_idx in range(num_cols):
        h_bbox = temp_draw.textbbox((0, 0), str(headers[c_idx]), font=header_font)
        max_w = (h_bbox[2] - h_bbox[0]) + 40 # 20px padding each side

        for row in rows:
            val = str(row[c_idx]) if c_idx < len(row) else ""
            r_bbox = temp_draw.textbbox((0, 0), val, font=cell_font)
            val_w = (r_bbox[2] - r_bbox[0]) + 40
            if val_w > max_w:
                max_w = val_w

        if total_row and c_idx < len(total_row):
            t_val = str(total_row[c_idx])
            t_bbox = temp_draw.textbbox((0, 0), t_val, font=total_font)
            val_w = (t_bbox[2] - t_bbox[0]) + 40
            if val_w > max_w:
                max_w = val_w

        col_widths.append(max(max_w, 120))

    table_width = sum(col_widths)
    margin_x = 24
    image_width = table_width + margin_x * 2

    # Generous heights for mobile readability
    banner_height = 96
    header_height = 50
    row_height = 46
    total_height = 54 if total_row else 0
    footer_height = 46 if footer_notes else 24

    image_height = banner_height + header_height + (len(rows) * row_height) + total_height + footer_height + 24

    img = Image.new("RGB", (image_width, image_height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 1. Top Banner
    draw.rectangle([(0, 0), (image_width, banner_height)], fill=th["title_bg"])
    draw.rectangle([(0, 0), (image_width, 6)], fill=th["accent"])

    draw.text((margin_x, 18), title, font=title_font, fill=th["title_text"])
    draw.text((margin_x, 58), subtitle, font=sub_font, fill=th["sub_text"])

    # 2. Header
    y_cursor = banner_height + 12
    x_cursor = margin_x

    draw.rectangle([(margin_x, y_cursor), (image_width - margin_x, y_cursor + header_height)], fill=th["header_bg"])

    for c_idx, h_text in enumerate(headers):
        w = col_widths[c_idx]
        align = col_alignments[c_idx]
        t_bbox = draw.textbbox((0, 0), str(h_text), font=header_font)
        text_w = t_bbox[2] - t_bbox[0]
        text_h = t_bbox[3] - t_bbox[1]

        if align == "center":
            pos_x = x_cursor + (w - text_w) / 2
        elif align == "right":
            pos_x = x_cursor + w - text_w - 18
        else:
            pos_x = x_cursor + 18

        pos_y = y_cursor + (header_height - text_h) / 2 - 2
        draw.text((pos_x, pos_y), str(h_text), font=header_font, fill=th["header_text"])

        if c_idx < num_cols - 1:
            draw.line([(x_cursor + w, y_cursor), (x_cursor + w, y_cursor + header_height)], fill=(51, 65, 85), width=1)

        x_cursor += w

    y_cursor += header_height

    # 3. Data Rows (Zebra)
    for r_idx, row in enumerate(rows):
        row_bg = th["stripe_odd"] if r_idx % 2 == 1 else th["stripe_even"]
        draw.rectangle([(margin_x, y_cursor), (image_width - margin_x, y_cursor + row_height)], fill=row_bg)
        draw.line([(margin_x, y_cursor + row_height), (image_width - margin_x, y_cursor + row_height)], fill=th["grid_border"], width=1)

        x_cursor = margin_x
        for c_idx in range(num_cols):
            w = col_widths[c_idx]
            val = str(row[c_idx]) if c_idx < len(row) else ""
            align = col_alignments[c_idx]

            t_bbox = draw.textbbox((0, 0), val, font=cell_font)
            text_w = t_bbox[2] - t_bbox[0]
            text_h = t_bbox[3] - t_bbox[1]

            if align == "center":
                pos_x = x_cursor + (w - text_w) / 2
            elif align == "right":
                pos_x = x_cursor + w - text_w - 18
            else:
                pos_x = x_cursor + 18

            pos_y = y_cursor + (row_height - text_h) / 2 - 1
            draw.text((pos_x, pos_y), val, font=cell_font, fill=th["text_main"])
            draw.line([(x_cursor + w, y_cursor), (x_cursor + w, y_cursor + row_height)], fill=th["grid_border"], width=1)
            x_cursor += w

        y_cursor += row_height

    # 4. Totals Row
    if total_row:
        draw.rectangle([(margin_x, y_cursor), (image_width - margin_x, y_cursor + total_height)], fill=th["total_bg"])
        draw.line([(margin_x, y_cursor), (image_width - margin_x, y_cursor)], fill=(100, 116, 139), width=2)
        draw.line([(margin_x, y_cursor + total_height), (image_width - margin_x, y_cursor + total_height)], fill=(100, 116, 139), width=2)

        x_cursor = margin_x
        for c_idx in range(num_cols):
            w = col_widths[c_idx]
            val = str(total_row[c_idx]) if c_idx < len(total_row) else ""
            align = col_alignments[c_idx]

            t_bbox = draw.textbbox((0, 0), val, font=total_font)
            text_w = t_bbox[2] - t_bbox[0]
            text_h = t_bbox[3] - t_bbox[1]

            if align == "center":
                pos_x = x_cursor + (w - text_w) / 2
            elif align == "right":
                pos_x = x_cursor + w - text_w - 18
            else:
                pos_x = x_cursor + 18

            pos_y = y_cursor + (total_height - text_h) / 2 - 1
            draw.text((pos_x, pos_y), val, font=total_font, fill=th["total_text"] if (align == "right" and val) else th["text_main"])
            draw.line([(x_cursor + w, y_cursor), (x_cursor + w, y_cursor + total_height)], fill=th["grid_border"], width=1)
            x_cursor += w

        y_cursor += total_height

    draw.rectangle([(margin_x, banner_height + 12), (image_width - margin_x, y_cursor)], outline=(100, 116, 139), width=1)

    # 5. Footer Notes
    if footer_notes:
        draw.text((margin_x, y_cursor + 14), footer_notes, font=footer_font, fill=(100, 116, 139))

    output = io.BytesIO()
    img.save(output, format="PNG", optimize=True)
    output.seek(0)
    return output
