from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import User, DriverProfile
from .models_feedback import Feedback


class DriverProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverProfile
        fields = [
            'id', 'license_number', 'license_expiry', 'emergency_contact',
            'years_experience', 'is_available', 'current_shift_start', 'current_shift_end'
        ]


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    approval_status_display = serializers.CharField(source='get_approval_status_display', read_only=True)
    profile_picture_url = serializers.SerializerMethodField()
    driver_profile = DriverProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'role_display', 'phone', 'address', 'nid_number',
            'employee_id', 'university_id', 'profile_picture', 'profile_picture_url',
            'is_active', 'is_active_driver', 'approval_status', 'approval_status_display',
            'rejection_reason', 'created_at', 'updated_at', 'driver_profile'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_profile_picture_url(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        is_owner = request and request.user and request.user.is_authenticated and request.user.id == instance.id
        is_admin = request and request.user and request.user.is_authenticated and request.user.is_admin_user
        # Do not expose sensitive personal identification to third parties
        if not (is_owner or is_admin):
            data.pop('nid_number', None)
            data.pop('address', None)
        return data


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    university_id = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=[('student', 'Student'), ('faculty', 'Faculty'), ('staff', 'Staff')])

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_university_id(self, value):
        value = value.strip()
        if len(value) < 4:
            raise serializers.ValidationError('University ID must be at least 4 characters.')
        if User.objects.filter(university_id=value).exists():
            raise serializers.ValidationError('This University ID is already registered.')
        return value

    def validate(self, attrs):
        password = attrs.get('password')
        university_id = attrs.get('university_id')
        username = attrs.get('username')

        if password:
            # Disallow predictable passwords derived from public university identifiers
            if university_id and password.strip().lower() == university_id.strip().lower():
                raise serializers.ValidationError({
                    'password': 'Password cannot be identical to your University ID.'
                })
            if username and password.strip().lower() == username.strip().lower():
                raise serializers.ValidationError({
                    'password': 'Password cannot be identical to your username.'
                })

            temp_user = User(username=username or '', university_id=university_id or '')
            try:
                validate_password(password, user=temp_user)
            except DjangoValidationError as err:
                raise serializers.ValidationError({'password': list(err.messages)})

        return attrs

    def create(self, validated_data):
        full_name = validated_data['full_name'].strip()
        parts = full_name.split(' ', 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ''
        user = User(
            username=validated_data['username'],
            first_name=first_name,
            last_name=last_name,
            university_id=validated_data['university_id'],
            role=validated_data['role'],
            approval_status='pending',
            is_active=False,
        )
        user.set_password(validated_data['password'])
        user.save()
        return user


class AuthorityFeedbackSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Feedback
        fields = ['id', 'user', 'user_name', 'feedback_type', 'message', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username
