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

        # Actual dimensions of Screenshot_2026-04-18_at_11.20.59AM.png are 392x650
        # Centering a 200px width box: (392 - 200) / 2 = 96
        ProductView.objects.update_or_create(
            product=product,
            label="Front View",
            view_key="front",
            defaults={
                "base_image": "catalog/Screenshot_2026-04-18_at_11.20.59AM.png",
                "print_area_x": 96,
                "print_area_y": 170,
                "print_area_width": 200,
                "print_area_height": 280,
                "sort_order": 1,
                "is_active": True,
            },
        )

        self.stdout.write(
            self.style.SUCCESS("Sample catalog seeded with Classic Black Hoodie.")
        )
