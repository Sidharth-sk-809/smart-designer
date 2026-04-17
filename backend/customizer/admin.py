from django.contrib import admin

from .models import Product, ProductView


class ProductViewInline(admin.TabularInline):
    model = ProductView
    extra = 0
    fields = (
        "label",
        "view_key",
        "base_image",
        "print_area_x",
        "print_area_y",
        "print_area_width",
        "print_area_height",
        "sort_order",
        "is_active",
    )


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    inlines = [ProductViewInline]


@admin.register(ProductView)
class ProductViewAdmin(admin.ModelAdmin):
    list_display = ("label", "product", "view_key", "sort_order", "is_active")
    list_filter = ("view_key", "is_active")
    search_fields = ("label", "product__name")
