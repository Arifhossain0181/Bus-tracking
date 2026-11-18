from django.contrib import admin
from .models import Issue, IssueComment, IssueAttachment

class IssueCommentInline(admin.TabularInline):
    model = IssueComment
    extra = 0

@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ('issue_type', 'reported_by', 'bus', 'status', 'priority', 'created_at')
    list_filter = ('issue_type', 'status', 'priority')
    search_fields = ('description', 'reported_by__username')
    inlines = [IssueCommentInline]

@admin.register(IssueComment)
class IssueCommentAdmin(admin.ModelAdmin):
    list_display = ('issue', 'user', 'created_at')

@admin.register(IssueAttachment)
class IssueAttachmentAdmin(admin.ModelAdmin):
    list_display = ('issue', 'uploaded_by', 'uploaded_at')
