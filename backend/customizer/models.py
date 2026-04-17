from django.db import models
from django.utils.text import slugify


class Product(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=160, unique=True, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class ProductView(models.Model):
    VIEW_CHOICES = [
        ("front", "Front"),
        ("back", "Back"),
        ("left", "Left"),
        ("right", "Right"),
        ("detail", "Detail"),
    ]

    product = models.ForeignKey(
        Product,
        related_name="views",
        on_delete=models.CASCADE,
    )
    label = models.CharField(max_length=120)
    view_key = models.CharField(max_length=20, choices=VIEW_CHOICES)
    base_image = models.ImageField(upload_to="catalog/")
    print_area_x = models.PositiveIntegerField()
    print_area_y = models.PositiveIntegerField()
    print_area_width = models.PositiveIntegerField()
    print_area_height = models.PositiveIntegerField()
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]
        unique_together = ["product", "view_key", "label"]

    def __str__(self) -> str:
        return f"{self.product.name} - {self.label}"
