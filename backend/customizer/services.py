from io import BytesIO

import numpy as np
from PIL import Image, ImageOps

from .processor.engine import render_design_on_product
from .processor.utils import pil_to_cv2, cv2_to_pil


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
    rotation: float = 0,
    print_area: dict | None = None,
) -> bytes:
    """
    Render design on product with OpenCV-based realistic blending.
    
    Args:
        product_view: ProductView model instance
        design_file: Uploaded design file
        x_ratio: Horizontal position (0.0-1.0)
        y_ratio: Vertical position (0.0-1.0)
        width_ratio: Design width relative to print area (0.0-1.0)
        rotation: Design rotation angle in degrees (-45 to 45)
        print_area: Optional print area override dict with x, y, width, height
    
    Returns:
        PNG image bytes
    """
    with Image.open(product_view.base_image.path) as base_handle:
        base_image = ImageOps.exif_transpose(base_handle).convert("RGB")

    with Image.open(design_file) as design_handle:
        design_image = ImageOps.exif_transpose(design_handle).convert("RGBA")

    print_area = print_area or {
        "x": product_view.print_area_x,
        "y": product_view.print_area_y,
        "width": product_view.print_area_width,
        "height": product_view.print_area_height,
    }

    # Calculate target dimensions maintaining aspect ratio
    design_aspect = design_image.width / max(design_image.height, 1)
    max_width_from_height = design_aspect * (print_area["height"] / max(print_area["width"], 1))
    max_width_ratio = min(0.95, max_width_from_height)
    min_width_ratio = min(0.08, max_width_ratio)
    width_ratio = clamp(width_ratio, min_width_ratio, max_width_ratio)

    target_width = max(1, int(round(print_area["width"] * width_ratio)))
    target_height = max(1, int(round(target_width / design_aspect)))

    # Calculate position within print area
    max_x = print_area["x"] + print_area["width"] - target_width
    max_y = print_area["y"] + print_area["height"] - target_height

    x_ratio = clamp(x_ratio, 0.0, 1.0)
    y_ratio = clamp(y_ratio, 0.0, 1.0)

    target_x = int(round(print_area["x"] + (print_area["width"] * x_ratio)))
    target_y = int(round(print_area["y"] + (print_area["height"] * y_ratio)))

    target_x = min(max(target_x, print_area["x"]), max_x)
    target_y = min(max(target_y, print_area["y"]), max_y)

    # Clamp rotation
    rotation = clamp(rotation, -45, 45)

    # Convert images to OpenCV format (BGR)
    product_cv = pil_to_cv2(base_image)
    design_cv = pil_to_cv2(design_image)

    # Use OpenCV engine for realistic rendering
    composite_cv = render_design_on_product(
        product_cv,
        design_cv,
        target_x,
        target_y,
        target_width,
        target_height,
        rotation=rotation,
    )

    # Convert back to PIL and save
    composite_pil = cv2_to_pil(composite_cv)
    
    buffer = BytesIO()
    composite_pil.save(buffer, format="PNG")
    return buffer.getvalue()
