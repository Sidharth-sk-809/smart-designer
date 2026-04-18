"""
Utility functions for image conversion and processing.
"""

import cv2
import numpy as np
from PIL import Image


def pil_to_cv2(image: Image.Image) -> np.ndarray:
    """
    Convert PIL Image to OpenCV format (BGR).
    
    Args:
        image: PIL Image
    
    Returns:
        OpenCV image array (BGR format)
    """
    if image.mode == 'RGBA':
        # Split alpha channel
        rgb = image.convert('RGB')
        alpha = image.split()[3]
        
        # Convert RGB to BGR
        bgr = np.array(rgb)
        bgr = cv2.cvtColor(bgr, cv2.COLOR_RGB2BGR)
        alpha_arr = np.array(alpha)
        
        # Combine with alpha
        result = np.dstack([bgr, alpha_arr])
        return result
    
    elif image.mode == 'RGB':
        rgb = np.array(image)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        return bgr
    
    elif image.mode == 'L':
        return np.array(image)
    
    else:
        # Convert any other mode to RGB first
        rgb = image.convert('RGB')
        bgr = np.array(rgb)
        return cv2.cvtColor(bgr, cv2.COLOR_RGB2BGR)


def cv2_to_pil(image: np.ndarray) -> Image.Image:
    """
    Convert OpenCV image to PIL Image.
    
    Args:
        image: OpenCV image array (BGR or BGRA)
    
    Returns:
        PIL Image (RGB or RGBA)
    """
    if len(image.shape) == 3 and image.shape[2] == 4:
        # BGRA to RGBA
        bgr = image[:, :, :3]
        alpha = image[:, :, 3]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        
        # Combine
        pil_img = Image.new('RGBA', (rgb.shape[1], rgb.shape[0]))
        pil_img.paste(Image.fromarray(rgb, 'RGB'), (0, 0))
        pil_img.putalpha(Image.fromarray(alpha, 'L'))
        return pil_img
    
    elif len(image.shape) == 3 and image.shape[2] == 3:
        # BGR to RGB
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb, 'RGB')
    
    else:
        return Image.fromarray(image, 'L')


def clamp(value: float, minimum: float, maximum: float) -> float:
    """Clamp value between minimum and maximum."""
    return max(minimum, min(value, maximum))
