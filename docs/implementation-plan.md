# Step-by-step implementation plan

## Phase 1: MVP

### Goal

Let a user pick a product image, upload a design, move and resize it in real time, and generate a clean preview render.

### Scope

- React editor with live product preview
- Django REST API for catalog data and final render
- Pillow-based compositing
- Fixed print area configured by an admin
- One artwork layer
- Basic concurrency handled by stateless render requests

### Implementation steps

1. Create the Django project and React app.
2. Model `Product` and `ProductView` in Django.
3. Store per-view print area coordinates in pixel space.
4. Register products and views in Django admin.
5. Build a `GET /api/products/` endpoint returning image metadata and print areas.
6. Build a `POST /api/render-preview/` endpoint accepting a design image and placement ratios.
7. Use Pillow to resize the design and composite it onto the original garment image.
8. Add a small lighting-transfer pass so dark and bright areas from the shirt subtly affect the artwork.
9. Build a React editor with:
   - Product selector
   - View selector
   - Artwork uploader
   - Drag and resize handles constrained to the print area
   - Scale and position sliders
10. Add a catalog-builder flow so admins can upload a base product image and visually mark its printable rectangle.
11. Send placement data to Django and show the rendered preview/download.
12. Seed the catalog with at least one real product image.
13. Validate the editor on desktop and mobile.

### Why this is the right MVP

- It proves the most important UX loop quickly.
- It keeps backend logic simple and testable.
- It creates a clean foundation for later fabric realism.
- It avoids premature computer-vision complexity.

## Phase 2: Better realism

### Goal

Make the rendered design look attached to the garment instead of simply placed on top.

### Additions

1. Store a garment mask per product view to isolate printable regions.
2. Estimate a perspective transform from configured corner points or detected landmarks.
3. Generate a luminance/displacement helper map from the garment photo.
4. Warp the design using NumPy/OpenCV before compositing.
5. Blend using multiply, overlay, or custom alpha logic to preserve folds and shadows.
6. Cache transformed outputs by product-view and layout hash.

## Phase 3: Production hardening

### Goal

Support higher traffic, more products, and operational reliability.

### Additions

1. Move media storage to S3-compatible object storage.
2. Offload final render jobs to Celery workers.
3. Use Redis for queueing and cache.
4. Add image size limits, antivirus checks, and upload validation.
5. Add audit logs for admin catalog edits.
6. Add template versioning for print-area changes.
7. Create automated tests for placement math and render correctness.

## Detailed build prompt

Use this prompt if you want to continue the project with another coding pass:

> Build a Django + React product customization system. For Phase 1, implement a catalog of products and product views, each with a fixed printable area defined in Django admin. In React, let users choose a product, upload a design, and drag/resize it in real time within the allowed print zone. Send normalized placement data to a Django API that uses Pillow and NumPy to render a PNG preview on top of the original product image. Keep the MVP focused on fast UX and stable architecture; do not implement perspective correction or wrinkle-based displacement yet. Make the system extensible so later phases can add masks, perspective warp, displacement maps, async rendering with Celery, and multi-product support.
