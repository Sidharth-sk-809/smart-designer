from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from customizer.models import Product, ProductView


class Command(BaseCommand):
    help = "Seed a sample t-shirt product using the bundled assets."

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)
        base_image_path = media_root / "catalog" / "basic-tee-front.png"

        if not base_image_path.exists():
            raise CommandError(
                "Sample product image is missing at "
                f"{base_image_path}. Copy the asset into backend/media/catalog first."
            )

        product, _ = Product.objects.update_or_create(
            slug="essential-oversized-tee",
            defaults={
                "name": "Essential Oversized Tee",
                "description": (
                    "Phase 1 MVP sample tee. Supports a front print area "
                    "with real-time drag and resize controls."
                ),
                "is_active": True,
            },
        )

        ProductView.objects.update_or_create(
            product=product,
            label="Front View",
            view_key="front",
            defaults={
                "base_image": "catalog/basic-tee-front.png",
                "print_area_x": 163,
                "print_area_y": 176,
                "print_area_width": 296,
                "print_area_height": 324,
                "sort_order": 1,
                "is_active": True,
            },
        )

        self.stdout.write(
            self.style.SUCCESS("Sample catalog seeded with Essential Oversized Tee.")
        )
