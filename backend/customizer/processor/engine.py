"""
OpenCV-based design rendering engine for realistic product customization.

This module implements four key techniques:
1. Perspective Warp: Transforms design to match product surface angle
2. Displacement Mapping: Applies wrinkles/folds from product texture
3. Shadow Extraction: Blends shadows using multiply mode
4. Edge Masking: Soft blur on edges for realistic ink absorption
"""

import cv2
import numpy as np
from PIL import Image


def perspective_warp(design: np.ndarray, rotation: float = 0) -> np.ndarray:
    """
    Apply perspective transformation to make design fit product surface.
    
    Args:
        design: Input design image (H x W x C)
        rotation: Rotation angle in degrees (-45 to 45)
    
    Returns:
        Perspective-warped design image
    """
    h, w = design.shape[:2]
    
    # Clamp rotation to reasonable range
    rotation = max(-45, min(45, rotation))
    rotation_rad = np.radians(rotation)
    
    # Define source points (corners of design)
    src_points = np.float32([
        [0, 0],
        [w, 0],
        [0, h],
        [w, h]
    ])
    
    # Calculate destination points based on rotation
    # This creates a subtle 3D perspective effect
    tilt_offset = int(h * 0.15 * (rotation / 45.0))
    
    dst_points = np.float32([
        [tilt_offset, 0],
        [w - tilt_offset, 0],
        [0, h],
        [w, h]
    ])
    
    # Compute perspective transformation matrix
    matrix = cv2.getPerspectiveTransform(src_points, dst_points)
    
    # Apply perspective warp
    warped = cv2.warpPerspective(design, matrix, (w, h))
    
    return warped


def create_displacement_map(product_crop: np.ndarray) -> np.ndarray:
    """
    Create displacement map from product texture for wrinkle effect.
    
    Converts product image to grayscale and applies gradients to detect
    folds, shadows, and texture details. This map will be used with cv2.remap
    to physically bend the design pixels.
    
    Args:
        product_crop: Product area image (H x W x 3 or 4)
    
    Returns:
        Displacement map as (mapx, mapy) for cv2.remap
    """
    h, w = product_crop.shape[:2]
    
    # Convert to grayscale
    if len(product_crop.shape) == 3 and product_crop.shape[2] == 4:
        gray = cv2.cvtColor(product_crop[:, :, :3], cv2.COLOR_BGR2GRAY)
    elif len(product_crop.shape) == 3:
        gray = cv2.cvtColor(product_crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = product_crop
    
    # Apply Gaussian blur to smooth out noise
    gray_smooth = cv2.GaussianBlur(gray, (5, 5), 1.0)
    
    # Calculate gradient magnitude (detects edges/folds)
    sobelx = cv2.Sobel(gray_smooth, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray_smooth, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = np.sqrt(sobelx**2 + sobely**2)
    
    # Normalize magnitude to 0-255
    magnitude = (magnitude / (magnitude.max() + 1e-5) * 50).astype(np.float32)
    magnitude = np.clip(magnitude, -5, 5)  # Keep displacement subtle
    
    # Create displacement maps
    mapx = np.zeros((h, w), dtype=np.float32)
    mapy = np.zeros((h, w), dtype=np.float32)
    
    for i in range(h):
        for j in range(w):
            # Direction from gradients
            dx = sobelx[i, j]
            dy = sobely[i, j]
            
            # Normalize direction
            norm = np.sqrt(dx**2 + dy**2) + 1e-5
            dx_norm = dx / norm
            dy_norm = dy / norm
            
            # Displace based on gradient magnitude
            disp = magnitude[i, j]
            mapx[i, j] = j + dx_norm * disp
            mapy[i, j] = i + dy_norm * disp
    
    # Clamp to valid coordinates
    mapx = np.clip(mapx, 0, w - 1).astype(np.float32)
    mapy = np.clip(mapy, 0, h - 1).astype(np.float32)
    
    return mapx, mapy


def apply_wrinkle_displacement(design: np.ndarray, mapx: np.ndarray, mapy: np.ndarray) -> np.ndarray:
    """
    Apply wrinkle displacement mapping to design using cv2.remap.
    
    Physically shifts design pixels based on product surface topology,
    making the design bend with folds and wrinkles.
    
    Args:
        design: Design image (H x W x C)
        mapx, mapy: Displacement maps from create_displacement_map
    
    Returns:
        Design with wrinkle deformation applied
    """
    h, w = design.shape[:2]
    
    if design.shape[2] == 4:  # RGBA
        # Split channels
        bgr = cv2.cvtColor(design[:, :, :3], cv2.COLOR_RGB2BGR)
        alpha = design[:, :, 3]
        
        # Apply remap to color channels
        remapped = cv2.remap(bgr, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        remapped_alpha = cv2.remap(alpha, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        
        # Combine
        result = cv2.cvtColor(remapped, cv2.COLOR_BGR2RGB)
        result = np.dstack([result, remapped_alpha])
    else:
        result = cv2.remap(design, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    
    return result


def extract_shadow_map(product_crop: np.ndarray, strength: float = 0.08) -> np.ndarray:
    """
    Extract shadow/lighting information from product for subtle multiply blending.
    
    Creates a shadow layer that makes the design appear under the same
    lighting as the product. Darker areas in the product become slightly darker
    in the final composite, but with minimal color shift.
    
    Args:
        product_crop: Product area image (H x W x 3 or 4)
        strength: Shadow strength (0.0-1.0), where higher = darker shadows
    
    Returns:
        Shadow map (H x W x 3) for multiply blending
    """
    h, w = product_crop.shape[:2]
    
    # Convert to grayscale
    if len(product_crop.shape) == 3 and product_crop.shape[2] == 4:
        gray = cv2.cvtColor(product_crop[:, :, :3], cv2.COLOR_BGR2GRAY)
    elif len(product_crop.shape) == 3:
        gray = cv2.cvtColor(product_crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = product_crop
    
    # Invert: dark areas become bright (for multiply mode)
    gray_inv = 255 - gray
    
    # Apply minimal strength: blend heavily towards 255 (neutral multiply)
    # strength=0.08 means only 8% of shadow, 92% neutral
    shadow = (gray_inv * strength) + (255 * (1 - strength))
    shadow = shadow.astype(np.uint8)
    
    # Create 3-channel shadow map
    shadow_map = np.stack([shadow, shadow, shadow], axis=2)
    
    return shadow_map


def apply_shadow_blend(design: np.ndarray, shadow_map: np.ndarray) -> np.ndarray:
    """
    Apply multiply blend mode using shadow map.
    
    Multiplies design colors by shadow map, making design darker
    where product shadows are darker.
    
    Args:
        design: Design image (H x W x 3 or 4)
        shadow_map: Shadow map (H x W x 3)
    
    Returns:
        Design with shadow blending applied
    """
    h, w = design.shape[:2]
    
    if design.shape[2] == 4:  # RGBA
        rgb = design[:, :, :3]
        alpha = design[:, :, 3:4]
    else:
        rgb = design
        alpha = np.ones((h, w, 1), dtype=np.uint8) * 255
    
    # Ensure shadow_map is same size
    if shadow_map.shape != rgb.shape:
        shadow_map = cv2.resize(shadow_map, (w, h))
    
    # Multiply blend: result = (color * shadow) / 255
    blended = (rgb.astype(np.float32) * shadow_map.astype(np.float32) / 255).astype(np.uint8)
    
    if design.shape[2] == 4:
        result = np.dstack([blended, alpha])
    else:
        result = blended
    
    return result


def apply_edge_mask(design: np.ndarray, blur_radius: int = 5) -> np.ndarray:
    """
    Apply Gaussian blur mask to edges for soft, realistic appearance.
    
    Creates a feathered edge that makes the design look like ink that
    has slightly soaked into the fabric, rather than a sharp sticker.
    
    Args:
        design: Design image with alpha channel (H x W x 4)
        blur_radius: Blur radius for feathering (1-10)
    
    Returns:
        Design with soft-edged alpha channel
    """
    if design.shape[2] != 4:
        return design
    
    h, w = design.shape[:2]
    alpha = design[:, :, 3]
    
    # Create edge mask: where alpha transitions from opaque to transparent
    # Dilate alpha to find edges
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha_dilated = cv2.dilate(alpha, kernel, iterations=1)
    
    # Find edge pixels
    edge_mask = alpha_dilated - alpha
    
    # Blur the edges to feather them
    blur_radius = max(1, min(blur_radius, 10))
    blurred_alpha = cv2.GaussianBlur(alpha, (blur_radius * 2 + 1, blur_radius * 2 + 1), 0)
    
    # Composite original alpha with blurred version at edges
    result_alpha = np.where(edge_mask > 0, blurred_alpha, alpha)
    
    # Create result
    result = design.copy()
    result[:, :, 3] = result_alpha.astype(np.uint8)
    
    return result


def render_design_on_product(
    product_image: np.ndarray,
    design_image: np.ndarray,
    x: int,
    y: int,
    width: int,
    height: int,
    rotation: float = 0,
) -> np.ndarray:
    """
    Render design on product with realistic blending using four techniques.
    
    Simplified pipeline prioritizing color accuracy:
    1. Perspective warp - 3D tilt based on rotation
    2. Shadow extraction - Subtle lighting blend
    3. Edge masking - Soft feathering
    4. Alpha compositing - Clean placement
    
    Args:
        product_image: Base product image (H x W x 3 or 4, BGR)
        design_image: Design image to place (BGR or BGRA)
        x, y: Top-left position
        width, height: Target size for design
        rotation: Rotation angle in degrees
    
    Returns:
        Composite image with design realistically blended on product
    """
    # Ensure product is BGR
    if product_image.shape[2] == 4:
        product_image = cv2.cvtColor(product_image, cv2.COLOR_BGRA2BGR)
    
    # Resize design to target size
    design_resized = cv2.resize(design_image, (width, height), interpolation=cv2.INTER_LANCZOS4)
    
    # Step 1: Perspective warp (for 3D tilt effect)
    design_warped = perspective_warp(design_resized, rotation)
    
    # Step 2: Get product crop for shadow analysis
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(product_image.shape[1], x + width), min(product_image.shape[0], y + height)
    product_crop = product_image[y1:y2, x1:x2].copy()
    
    # Step 3: Apply subtle shadow blending for realistic lighting
    # This applies only minimal shadow overlay to preserve design colors
    shadow_map = extract_shadow_map(product_crop, strength=0.08)
    design_shadowed = apply_shadow_blend(design_warped, shadow_map)
    
    # Step 4: Apply edge masking for soft appearance (feathered edges)
    design_final = apply_edge_mask(design_shadowed)
    
    # Composite onto product with proper alpha blending
    composite = product_image.copy()
    
    # Extract RGB and alpha, ensure proper alpha channel
    if design_final.shape[2] == 4:
        design_bgr = cv2.cvtColor(design_final[:, :, :3], cv2.COLOR_RGB2BGR)
        alpha = design_final[:, :, 3:4].astype(np.float32) / 255.0
    else:
        design_bgr = design_final
        alpha = np.ones((design_final.shape[0], design_final.shape[1], 1), dtype=np.float32)
    
    # Blend design onto product using alpha compositing
    # Result = (1 - alpha) * product + alpha * design
    product_region = composite[y1:y2, x1:x2].astype(np.float32)
    design_region = design_bgr.astype(np.float32)
    
    blended = (1 - alpha) * product_region + alpha * design_region
    composite[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)
    
    return composite
