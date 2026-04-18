from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from customizer.models import Product, ProductView


class Command(BaseCommand):
    help = "Seed a sample t-shirt product using the bundled assets."

    def handle(self, *args, **options):
        product, _ = Product.objects.update_or_create(
            slug="classic-black-hoodie",
            defaults={
                "name": "Classic Black Hoodie",
                "description": (
                    "Premium heavyweight cotton hoodie. Supports high-resolution "
                    "front printing with realistic wrinkle displacement."
                ),
                "is_active": True,
            },
        )

        # Approximate coordinates based on the screenshot provided by the user
        # Image is roughly 400-500px wide. Box is centered.
        ProductView.objects.update_or_create(
            product=product,
            label="Front View",
            view_key="front",
            defaults={
                "base_image": "catalog/Screenshot_2026-04-18_at_11.20.59AM.png",
                "print_area_x": 100,
                "print_area_y": 120,
                "print_area_width": 200,
                "print_area_height": 240,
                "sort_order": 1,
                "is_active": True,
            },
        )

        self.stdout.write(
            self.style.SUCCESS("Sample catalog seeded with Classic Black Hoodie.")
        )
