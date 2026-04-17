from django.urls import path

from .views import (
    HealthView,
    ManageProductCreateView,
    ManageProductViewCreateView,
    ManageProductViewPrintAreaUpdateView,
    ProductListView,
    RenderPreviewView,
)

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("products/", ProductListView.as_view(), name="product-list"),
    path("manage/products/", ManageProductCreateView.as_view(), name="manage-product-create"),
    path(
        "manage/product-views/",
        ManageProductViewCreateView.as_view(),
        name="manage-product-view-create",
    ),
    path(
        "manage/product-views/<int:product_view_id>/print-area/",
        ManageProductViewPrintAreaUpdateView.as_view(),
        name="manage-product-view-print-area-update",
    ),
    path("render-preview/", RenderPreviewView.as_view(), name="render-preview"),
]
