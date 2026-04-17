from io import BytesIO

import numpy as np
from PIL import Image, ImageOps


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def apply_subtle_lighting(base_crop: Image.Image, design_image: Image.Image) -> Image.Image:
    if base_crop.size != design_image.size:
        base_crop = base_crop.resize(design_image.size, Image.Resampling.BICUBIC)

    base_luma = np.asarray(base_crop.convert("L"), dtype=np.float32) / 255.0
    contrast_wave = (base_luma - base_luma.mean()) * 0.28
    lighting = np.clip(1.0 + contrast_wave, 0.9, 1.12)

    design_arr = np.asarray(design_image, dtype=np.float32)
    design_arr[..., :3] = np.clip(design_arr[..., :3] * lighting[..., None], 0, 255)

    return Image.fromarray(design_arr.astype(np.uint8), "RGBA")


def apply_opacity(image: Image.Image, opacity: float) -> Image.Image:
    output = image.copy()
    alpha_channel = output.getchannel("A")
    alpha_channel = alpha_channel.point(lambda pixel: int(pixel * opacity))
    output.putalpha(alpha_channel)
    return output


def render_mockup(
    product_view,
    design_file,
    x_ratio: float,
    y_ratio: float,
    width_ratio: float,
    print_area: dict | None = None,
) -> bytes:
    with Image.open(product_view.base_image.path) as base_handle:
        base_image = ImageOps.exif_transpose(base_handle).convert("RGBA")

    with Image.open(design_file) as design_handle:
        design_image = ImageOps.exif_transpose(design_handle).convert("RGBA")

    print_area = print_area or {
        "x": product_view.print_area_x,
        "y": product_view.print_area_y,
        "width": product_view.print_area_width,
        "height": product_view.print_area_height,
    }

    design_aspect = design_image.width / max(design_image.height, 1)
    max_width_from_height = design_aspect * (print_area["height"] / max(print_area["width"], 1))
    max_width_ratio = min(0.95, max_width_from_height)
    min_width_ratio = min(0.08, max_width_ratio)
    width_ratio = clamp(width_ratio, min_width_ratio, max_width_ratio)

    target_width = max(1, int(round(print_area["width"] * width_ratio)))
    target_height = max(1, int(round(target_width / design_aspect)))

    max_x = print_area["x"] + print_area["width"] - target_width
    max_y = print_area["y"] + print_area["height"] - target_height

    x_ratio = clamp(x_ratio, 0.0, 1.0)
    y_ratio = clamp(y_ratio, 0.0, 1.0)

    target_x = int(round(print_area["x"] + (print_area["width"] * x_ratio)))
    target_y = int(round(print_area["y"] + (print_area["height"] * y_ratio)))

    target_x = min(max(target_x, print_area["x"]), max_x)
    target_y = min(max(target_y, print_area["y"]), max_y)

    resized_design = design_image.resize((target_width, target_height), Image.Resampling.LANCZOS)
    lighting_crop = base_image.crop(
        (target_x, target_y, target_x + target_width, target_y + target_height)
    )
    shaded_design = apply_subtle_lighting(lighting_crop, resized_design)
    shaded_design = apply_opacity(shaded_design, 0.96)

    composite = base_image.copy()
    composite.alpha_composite(shaded_design, (target_x, target_y))

    buffer = BytesIO()
    composite.save(buffer, format="PNG")
    return buffer.getvalue()
