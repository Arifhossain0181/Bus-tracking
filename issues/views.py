from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.paginator import Paginator
from django.utils import timezone
from accounts.decorators import admin_required, driver_required
from buses.models import BusAssignment
from .models import Issue, IssueComment
from .forms import IssueForm, IssueUpdateForm, IssueCommentForm

@login_required
def issue_list(request):
    if request.user.is_driver:
        issues = Issue.objects.filter(reported_by=request.user)
    elif request.user.is_admin_user or request.user.is_authority:
        issues = Issue.objects.all()
    else:
        issues = Issue.objects.none()
    
    status = request.GET.get('status')
    if status:
        issues = issues.filter(status=status)
    
    issue_type = request.GET.get('type')
    if issue_type:
        issues = issues.filter(issue_type=issue_type)
    
    issues = issues.select_related('reported_by', 'bus', 'route').order_by('-created_at')
    
    paginator = Paginator(issues, 20)
    page = request.GET.get('page')
    issues = paginator.get_page(page)
    
    return render(request, 'issues/issue_list.html', {'issues': issues})


@login_required
def issue_detail(request, pk):
    issue = get_object_or_404(
        Issue.objects.select_related('reported_by', 'bus', 'route', 'assigned_to'),
        pk=pk
    )
    
    if request.user.is_driver and issue.reported_by != request.user:
        messages.error(request, 'Access denied.')
        return redirect('issues:list')
    
    comments = issue.comments.select_related('user').all()
    
    if request.method == 'POST':
        if 'comment' in request.POST:
            comment_form = IssueCommentForm(request.POST)
            if comment_form.is_valid():
                comment = comment_form.save(commit=False)
                comment.issue = issue
                comment.user = request.user
                comment.save()
                messages.success(request, 'Comment added.')
                return redirect('issues:detail', pk=pk)
        elif 'update' in request.POST and (request.user.is_admin_user or request.user.is_authority):
            update_form = IssueUpdateForm(request.POST, instance=issue)
            if update_form.is_valid():
                updated = update_form.save(commit=False)
                if updated.status == 'resolved' and not issue.resolved_at:
                    updated.resolved_at = timezone.now()
                updated.save()
                messages.success(request, 'Issue updated.')
                return redirect('issues:detail', pk=pk)
    
    comment_form = IssueCommentForm()
    update_form = IssueUpdateForm(instance=issue) if request.user.is_admin_user or request.user.is_authority else None
    
    return render(request, 'issues/issue_detail.html', {
        'issue': issue,
        'comments': comments,
        'comment_form': comment_form,
        'update_form': update_form
    })


@login_required
@driver_required
def issue_create(request):
    if request.method == 'POST':
        form = IssueForm(request.POST)
        if form.is_valid():
            issue = form.save(commit=False)
            issue.reported_by = request.user
            
            lat = request.POST.get('latitude')
            lng = request.POST.get('longitude')
            if lat and lng:
                issue.latitude = lat
                issue.longitude = lng
            
            try:
                assignment = BusAssignment.objects.get(driver=request.user, is_active=True)
                issue.bus = assignment.bus
                issue.route = assignment.route
            except BusAssignment.DoesNotExist:
                pass
            
            issue.save()
            messages.success(request, 'Issue reported successfully.')
            return redirect('accounts:dashboard')
    else:
        form = IssueForm()
    
    return render(request, 'issues/issue_form.html', {'form': form})


@login_required
@admin_required
def issue_assign(request, pk):
    issue = get_object_or_404(Issue, pk=pk)
    
    if request.method == 'POST':
        issue.assigned_to = request.user
        issue.status = 'in_progress'
        issue.save()
        messages.success(request, 'Issue assigned to you.')
    
    return redirect('issues:detail', pk=pk)


@login_required
@admin_required
def issue_resolve(request, pk):
    issue = get_object_or_404(Issue, pk=pk)
    
    if request.method == 'POST':
        issue.status = 'resolved'
        issue.resolved_at = timezone.now()
        issue.resolution_notes = request.POST.get('resolution_notes', '')
        issue.save()
        messages.success(request, 'Issue marked as resolved.')
    
    return redirect('issues:detail', pk=pk)
