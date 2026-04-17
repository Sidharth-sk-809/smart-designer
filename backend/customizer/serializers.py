from PIL import Image
from rest_framework import serializers

from .models import Product, ProductView


class ProductViewSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(read_only=True)
    image_url = serializers.SerializerMethodField()
    image_width = serializers.SerializerMethodField()
    image_height = serializers.SerializerMethodField()
    print_area = serializers.SerializerMethodField()

    class Meta:
        model = ProductView
        fields = [
            "id",
            "product_id",
            "label",
            "view_key",
            "image_url",
            "image_width",
            "image_height",
            "print_area",
        ]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if not obj.base_image:
            return ""
        if request:
            return request.build_absolute_uri(obj.base_image.url)
        return obj.base_image.url

    def get_image_width(self, obj):
        return getattr(obj.base_image, "width", 0)

    def get_image_height(self, obj):
        return getattr(obj.base_image, "height", 0)

    def get_print_area(self, obj):
        return {
            "x": obj.print_area_x,
            "y": obj.print_area_y,
            "width": obj.print_area_width,
            "height": obj.print_area_height,
        }


class ProductSerializer(serializers.ModelSerializer):
    views = ProductViewSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = ["id", "name", "slug", "description", "views"]


class ProductCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "description"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        cleaned_value = value.strip()
        if not cleaned_value:
            raise serializers.ValidationError("Product name cannot be empty.")
        if Product.objects.filter(name__iexact=cleaned_value).exists():
            raise serializers.ValidationError("A product with this name already exists.")
        return cleaned_value


class ProductViewCreateSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.filter(is_active=True),
    )
    label = serializers.CharField(max_length=120)
    view_key = serializers.ChoiceField(choices=ProductView.VIEW_CHOICES)
    base_image = serializers.ImageField()
    sort_order = serializers.IntegerField(required=False, min_value=0, default=0)
    print_area_x_ratio = serializers.FloatField(min_value=0, max_value=1)
    print_area_y_ratio = serializers.FloatField(min_value=0, max_value=1)
    print_area_width_ratio = serializers.FloatField(min_value=0.01, max_value=1)
    print_area_height_ratio = serializers.FloatField(min_value=0.01, max_value=1)

    def validate_label(self, value):
        cleaned_value = value.strip()
        if not cleaned_value:
            raise serializers.ValidationError("View label cannot be empty.")
        return cleaned_value

    def validate(self, attrs):
        if attrs["print_area_x_ratio"] + attrs["print_area_width_ratio"] > 1:
            raise serializers.ValidationError(
                {"print_area_width_ratio": "Print area extends beyond the image width."}
            )

        if attrs["print_area_y_ratio"] + attrs["print_area_height_ratio"] > 1:
            raise serializers.ValidationError(
                {"print_area_height_ratio": "Print area extends beyond the image height."}
            )

        return attrs

    def create(self, validated_data):
        product = validated_data["product"]
        base_image = validated_data["base_image"]

        base_image.seek(0)
        with Image.open(base_image) as uploaded_image:
            image_width, image_height = uploaded_image.size
        base_image.seek(0)

        print_area_x = int(round(image_width * validated_data["print_area_x_ratio"]))
        print_area_y = int(round(image_height * validated_data["print_area_y_ratio"]))
        print_area_width = max(
            1,
            int(round(image_width * validated_data["print_area_width_ratio"])),
        )
        print_area_height = max(
            1,
            int(round(image_height * validated_data["print_area_height_ratio"])),
        )

        return ProductView.objects.create(
            product=product,
            label=validated_data["label"],
            view_key=validated_data["view_key"],
            base_image=base_image,
            sort_order=validated_data["sort_order"],
            print_area_x=print_area_x,
            print_area_y=print_area_y,
            print_area_width=print_area_width,
            print_area_height=print_area_height,
            is_active=True,
        )


class ProductViewPrintAreaUpdateSerializer(serializers.Serializer):
    print_area_x_ratio = serializers.FloatField(min_value=0, max_value=1)
    print_area_y_ratio = serializers.FloatField(min_value=0, max_value=1)
    print_area_width_ratio = serializers.FloatField(min_value=0.01, max_value=1)
    print_area_height_ratio = serializers.FloatField(min_value=0.01, max_value=1)

    def validate(self, attrs):
        if attrs["print_area_x_ratio"] + attrs["print_area_width_ratio"] > 1:
            raise serializers.ValidationError(
                {"print_area_width_ratio": "Print area extends beyond the image width."}
            )

        if attrs["print_area_y_ratio"] + attrs["print_area_height_ratio"] > 1:
            raise serializers.ValidationError(
                {"print_area_height_ratio": "Print area extends beyond the image height."}
            )

        return attrs

    def update(self, instance, validated_data):
        image_width = getattr(instance.base_image, "width", 0)
        image_height = getattr(instance.base_image, "height", 0)

        instance.print_area_x = int(round(image_width * validated_data["print_area_x_ratio"]))
        instance.print_area_y = int(round(image_height * validated_data["print_area_y_ratio"]))
        instance.print_area_width = max(
            1,
            int(round(image_width * validated_data["print_area_width_ratio"])),
        )
        instance.print_area_height = max(
            1,
            int(round(image_height * validated_data["print_area_height_ratio"])),
        )
        instance.save(
            update_fields=[
                "print_area_x",
                "print_area_y",
                "print_area_width",
                "print_area_height",
                "updated_at",
            ]
        )
        return instance
