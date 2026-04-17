from django.db import IntegrityError
from django.db.models import Prefetch
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product, ProductView
from .serializers import (
    ProductCreateSerializer,
    ProductSerializer,
    ProductViewCreateSerializer,
    ProductViewPrintAreaUpdateSerializer,
    ProductViewSerializer,
)
from .services import render_mockup


class HealthView(APIView):
    def get(self, request):
        return Response({"status": "ok"})


class ProductListView(APIView):
    def get(self, request):
        product_queryset = Product.objects.filter(is_active=True).prefetch_related(
            Prefetch(
                "views",
                queryset=ProductView.objects.filter(is_active=True).order_by("sort_order", "id"),
            )
        )
        serializer = ProductSerializer(
            product_queryset,
            many=True,
            context={"request": request},
        )
        return Response({"products": serializer.data})


class ManageProductCreateView(APIView):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request):
        serializer = ProductCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        response_serializer = ProductSerializer(product, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ManageProductViewCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = ProductViewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            product_view = serializer.save()
        except IntegrityError:
            return Response(
                {"detail": "That product already has a view with the same label and type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_serializer = ProductViewSerializer(
            product_view,
            context={"request": request},
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ManageProductViewPrintAreaUpdateView(APIView):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def patch(self, request, product_view_id):
        product_view = get_object_or_404(
            ProductView.objects.select_related("product"),
            pk=product_view_id,
            is_active=True,
            product__is_active=True,
        )
        serializer = ProductViewPrintAreaUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_view = serializer.update(product_view, serializer.validated_data)
        response_serializer = ProductViewSerializer(
            updated_view,
            context={"request": request},
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class RenderPreviewView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        design_file = request.FILES.get("design")
        if not design_file:
            return Response(
                {"detail": "A design image is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            product_view_id = int(request.data.get("product_view_id", ""))
            x_ratio = float(request.data.get("x_ratio", 0))
            y_ratio = float(request.data.get("y_ratio", 0))
            width_ratio = float(request.data.get("width_ratio", 0.6))
        except (TypeError, ValueError):
            return Response(
                {"detail": "Invalid layout payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product_view = get_object_or_404(
            ProductView.objects.select_related("product"),
            pk=product_view_id,
            is_active=True,
            product__is_active=True,
        )

        print_area_override = None
        print_area_fields = [
            "print_area_x_ratio",
            "print_area_y_ratio",
            "print_area_width_ratio",
            "print_area_height_ratio",
        ]
        if any(request.data.get(field) not in (None, "") for field in print_area_fields):
            print_area_serializer = ProductViewPrintAreaUpdateSerializer(data=request.data)
            print_area_serializer.is_valid(raise_exception=True)
            validated_area = print_area_serializer.validated_data
            image_width = getattr(product_view.base_image, "width", 0)
            image_height = getattr(product_view.base_image, "height", 0)
            print_area_override = {
                "x": int(round(image_width * validated_area["print_area_x_ratio"])),
                "y": int(round(image_height * validated_area["print_area_y_ratio"])),
                "width": max(
                    1,
                    int(round(image_width * validated_area["print_area_width_ratio"])),
                ),
                "height": max(
                    1,
                    int(round(image_height * validated_area["print_area_height_ratio"])),
                ),
            }

        rendered_bytes = render_mockup(
            product_view=product_view,
            design_file=design_file,
            x_ratio=x_ratio,
            y_ratio=y_ratio,
            width_ratio=width_ratio,
            print_area=print_area_override,
        )

        response = HttpResponse(rendered_bytes, content_type="image/png")
        response["Content-Disposition"] = (
            f'inline; filename="{product_view.product.slug}-{product_view.view_key}-preview.png"'
        )
        return response
