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


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    university_id = serializers.CharField(max_length=50)
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
        user.set_password(validated_data['university_id'])
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
