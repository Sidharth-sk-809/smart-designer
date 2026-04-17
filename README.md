# Product Customization System MVP

This repository contains a Phase 1 MVP for a product customization workflow built with Django, React, and Pillow. The current scope is intentionally focused on speed-to-launch:

- Static product catalog managed from Django admin
- Fixed print areas per product view
- Real-time drag and resize controls in React
- Server-side preview/export rendering in Django
- Mild lighting transfer from the garment photo for a cleaner mockup
- Visual catalog-builder flow for uploading new product views from the app

## Project structure

- `backend/` Django API, admin, product models, and Pillow render service
- `frontend/` React editor for product selection, design upload, live placement, and preview generation
- `backend/media/catalog/` seeded sample product photos
- `frontend/public/demo/` demo artwork used on first load
- `docs/implementation-plan.md` step-by-step implementation roadmap and phase breakdown

## Quick start

### 1. Backend

```bash
cd /Users/sidharth_sk/Desktop/test/smart\ designer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py seed_sample_data
python manage.py runserver
```

The admin panel is available at [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/). Create a superuser with `python manage.py createsuperuser` if you want to manage products visually.

### 2. Frontend

```bash
cd /Users/sidharth_sk/Desktop/test/smart\ designer/frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Using the app

- Top section: shopper-facing customizer for selecting a product, uploading artwork, moving it, resizing it, and generating a PNG preview.
- Top section also supports manual print-area editing. Use `Adjust print area` to drag or resize the dotted zone, `Save print area` to persist it, and `Previous view` / `Next view` to move across product angles.
- Bottom section: catalog builder for admins. Upload one or more optional product views, drag a printable rectangle over each image, and save them under the same product.
- As soon as a new view is saved, it becomes selectable in the customizer without restarting either server.

## API endpoints

- `GET /api/health/` health check
- `GET /api/products/` active products with base-image metadata and print area coordinates
- `POST /api/manage/products/` create a product record
- `POST /api/manage/product-views/` upload a base product image and save a printable area
- `POST /api/render-preview/` multipart form with `product_view_id`, `design`, `x_ratio`, `y_ratio`, `width_ratio`

## Phase 1 MVP scope

Phase 1 should stay deliberately narrow:

- One to a few garments with manually defined print areas
- Visual onboarding for product views so admins do not need to type coordinates
- Front-end preview is an editor overlay, not a true fabric simulation
- Export render uses Pillow compositing and light shading, but no perspective warp
- Single-artwork placement per view
- SQLite is acceptable for local validation
- Focus on UX speed, stable API shape, and admin operability

That gives you a usable prototype to validate the user flow before investing in computer vision, displacement maps, or asynchronous render pipelines.
