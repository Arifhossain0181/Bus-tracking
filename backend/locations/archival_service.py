"""
UBus Telemetry Archival Service
Handles safe, non-destructive, idempotent copying and verification of LocationHistory records
into cold storage (ArchivedLocationHistory) for telemetry data older than retention thresholds.
"""

import logging
import uuid
from datetime import timedelta
from typing import Optional, Dict, Any, List

from django.db import transaction
from django.utils import timezone

from .models import LocationHistory, ArchivedLocationHistory

logger = logging.getLogger(__name__)


def archive_location_history(
    cutoff_datetime: Optional[timezone.datetime] = None,
    days: int = 14,
    batch_size: int = 500,
    dry_run: bool = False,
    driver_id: Optional[int] = None,
    limit: Optional[int] = None,
    verify: bool = True,
) -> Dict[str, Any]:
    """
    Safely copy LocationHistory records older than cutoff_datetime into ArchivedLocationHistory.
    
    Guarantees:
    - Non-destructive: Source LocationHistory records are NEVER deleted or altered.
    - Idempotent: Re-running does not create duplicate archive records (enforced by original_id unique key).
    - Bounded memory: Records are processed in bounded batch chunks using keyset pagination.
    - Transactional: Each batch is enclosed in transaction.atomic() to avoid partial writes.
    - Verifiable: Verifies coordinate and timestamp accuracy on newly archived records.
    """
    if cutoff_datetime is None:
        cutoff_datetime = timezone.now() - timedelta(days=days)

    # Base queryset for qualifying source records
    source_qs = LocationHistory.objects.filter(timestamp__lt=cutoff_datetime)
    if driver_id:
        source_qs = source_qs.filter(driver_id=driver_id)
    source_qs = source_qs.order_by('id')

    qualifying_count = source_qs.count()
    target_total = min(limit, qualifying_count) if limit is not None else qualifying_count

    batch_run_id = f"arch_{timezone.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    # In dry-run mode, simulate and count pending vs already archived
    if dry_run:
        # Check overlap within target records
        target_ids = list(source_qs.values_list('id', flat=True)[:target_total]) if target_total <= 50000 else None
        if target_ids is not None:
            already_archived = ArchivedLocationHistory.objects.filter(original_id__in=target_ids).count()
        else:
            already_archived = ArchivedLocationHistory.objects.filter(timestamp__lt=cutoff_datetime).count()
            if limit and already_archived > target_total:
                already_archived = target_total

        pending_count = max(0, target_total - already_archived)
        return {
            'dry_run': True,
            'cutoff_datetime': cutoff_datetime.isoformat(),
            'days': days,
            'qualifying_count': qualifying_count,
            'target_count': target_total,
            'already_archived_count': already_archived,
            'pending_archive_count': pending_count,
            'archived_count': 0,
            'skipped_count': 0,
            'failed_count': 0,
            'verified': True,
            'batch_run_id': batch_run_id,
            'message': f"[DRY RUN] {pending_count} records pending archival out of {qualifying_count} qualifying (cutoff: {cutoff_datetime.isoformat()}). No data was written.",
        }

    # Live execution mode: batch keyset processing
    archived_count = 0
    skipped_count = 0
    failed_count = 0
    batches_processed = 0
    last_seen_id = 0
    newly_archived_ids: List[int] = []

    logger.info(
        "Beginning telemetry archival run %s. Cutoff: %s (days=%d), Target: %d records, Batch size: %d",
        batch_run_id, cutoff_datetime.isoformat(), days, target_total, batch_size
    )

    while (archived_count + skipped_count) < target_total:
        remaining = target_total - (archived_count + skipped_count)
        current_chunk_size = min(batch_size, remaining)

        batch_records = list(
            source_qs.filter(id__gt=last_seen_id).select_related('driver')[:current_chunk_size]
        )
        if not batch_records:
            break

        last_seen_id = batch_records[-1].id
        record_ids = [r.id for r in batch_records]

        # Identify which records in this batch are already in cold storage
        existing_archived_ids = set(
            ArchivedLocationHistory.objects.filter(original_id__in=record_ids).values_list('original_id', flat=True)
        )

        records_to_archive = [r for r in batch_records if r.id not in existing_archived_ids]
        skipped_in_batch = len(batch_records) - len(records_to_archive)
        skipped_count += skipped_in_batch

        if records_to_archive:
            archive_objects = [
                ArchivedLocationHistory(
                    original_id=rec.id,
                    driver=rec.driver,
                    driver_username=rec.driver.username if rec.driver else '',
                    latitude=rec.latitude,
                    longitude=rec.longitude,
                    timestamp=rec.timestamp,
                    archived_at=timezone.now(),
                    archive_batch_id=batch_run_id,
                )
                for rec in records_to_archive
            ]

            try:
                with transaction.atomic():
                    created = ArchivedLocationHistory.objects.bulk_create(
                        archive_objects,
                        batch_size=batch_size,
                        ignore_conflicts=True
                    )
                    archived_in_batch = len(created)
                    archived_count += archived_in_batch
                    newly_archived_ids.extend([obj.original_id for obj in archive_objects[:archived_in_batch]])
            except Exception as e:
                logger.exception("Failed to archive batch with IDs %s-%s: %s", record_ids[0], record_ids[-1], e)
                failed_count += len(records_to_archive)

        batches_processed += 1

    # Verification step
    verification_result = {'verified': True, 'checked': 0, 'mismatches': 0}
    if verify and newly_archived_ids:
        verification_result = verify_archive_integrity(
            cutoff_datetime=cutoff_datetime,
            sample_ids=newly_archived_ids[:min(200, len(newly_archived_ids))]
        )

    logger.info(
        "Completed telemetry archival run %s: Archived=%d, Skipped=%d, Failed=%d, Batches=%d, Verified=%s",
        batch_run_id, archived_count, skipped_count, failed_count, batches_processed, verification_result['verified']
    )

    return {
        'dry_run': False,
        'cutoff_datetime': cutoff_datetime.isoformat(),
        'days': days,
        'qualifying_count': qualifying_count,
        'target_count': target_total,
        'archived_count': archived_count,
        'skipped_count': skipped_count,
        'failed_count': failed_count,
        'batches_processed': batches_processed,
        'batch_run_id': batch_run_id,
        'verified': verification_result['verified'],
        'verification_details': verification_result,
        'message': f"Successfully archived {archived_count} records ({skipped_count} skipped, {failed_count} failed) in {batches_processed} batches.",
    }


def verify_archive_integrity(
    cutoff_datetime: Optional[timezone.datetime] = None,
    sample_ids: Optional[List[int]] = None,
    sample_size: int = 100,
) -> Dict[str, Any]:
    """
    Verify that archived records accurately match the original source records.
    Compares original_id, driver_id, driver_username, coordinates (lat/lng), timestamp,
    and optional telemetry attributes (accuracy, speed, heading) if present.
    """
    if sample_ids is not None:
        archive_qs = ArchivedLocationHistory.objects.filter(original_id__in=sample_ids)
    elif cutoff_datetime is not None:
        archive_qs = ArchivedLocationHistory.objects.filter(timestamp__lt=cutoff_datetime).order_by('-timestamp')[:sample_size]
    else:
        archive_qs = ArchivedLocationHistory.objects.order_by('-timestamp')[:sample_size]

    archived_list = list(archive_qs)
    verified_fields = ['original_id', 'driver_id', 'driver_username', 'latitude', 'longitude', 'timestamp']

    if not archived_list:
        return {
            'verified': True,
            'checked': 0,
            'mismatches': 0,
            'fields_verified': verified_fields,
            'details': []
        }

    target_original_ids = [a.original_id for a in archived_list]
    sources_by_id = {s.id: s for s in LocationHistory.objects.filter(id__in=target_original_ids).select_related('driver')}

    mismatches = []
    checked = 0

    for arch in archived_list:
        checked += 1
        source = sources_by_id.get(arch.original_id)
        if not source:
            # Source record might have been legitimately deleted in future purge, not an integrity error if verified
            continue

        errors = []
        if source.driver_id != arch.driver_id:
            errors.append(f"driver_id mismatch: source={source.driver_id}, archive={arch.driver_id}")
        if arch.driver_username and source.driver and source.driver.username != arch.driver_username:
            errors.append(f"driver_username mismatch: source={source.driver.username}, archive={arch.driver_username}")
        if source.latitude != arch.latitude:
            errors.append(f"latitude mismatch: source={source.latitude}, archive={arch.latitude}")
        if source.longitude != arch.longitude:
            errors.append(f"longitude mismatch: source={source.longitude}, archive={arch.longitude}")
        if source.timestamp != arch.timestamp:
            errors.append(f"timestamp mismatch: source={source.timestamp}, archive={arch.timestamp}")

        # Check optional telemetry fields if present on source or archive
        for opt_field in ['accuracy', 'speed', 'heading']:
            if hasattr(source, opt_field) and hasattr(arch, opt_field):
                if opt_field not in verified_fields:
                    verified_fields.append(opt_field)
                src_val = getattr(source, opt_field)
                arch_val = getattr(arch, opt_field)
                if src_val != arch_val:
                    errors.append(f"{opt_field} mismatch: source={src_val}, archive={arch_val}")

        if errors:
            mismatches.append({'original_id': arch.original_id, 'errors': errors})

    is_verified = (len(mismatches) == 0)
    return {
        'verified': is_verified,
        'checked': checked,
        'mismatches': len(mismatches),
        'fields_verified': verified_fields,
        'details': mismatches[:10],
    }


def get_combined_location_history(
    driver,
    start_time,
    end_time=None,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Retrieve location history points for a driver across both active and archived tables.
    Deduplicates seamlessly by stable original_id and orders chronologically.
    Distinct original records with identical coordinates or timestamps are fully preserved.
    """
    # 1. Active table query
    active_qs = LocationHistory.objects.filter(
        driver=driver,
        timestamp__gte=start_time
    )
    if end_time:
        active_qs = active_qs.filter(timestamp__lte=end_time)
    active_points = list(active_qs.order_by('timestamp', 'id'))

    # 2. Archive table query
    arch_qs = ArchivedLocationHistory.objects.filter(
        driver=driver,
        timestamp__gte=start_time
    )
    if end_time:
        arch_qs = arch_qs.filter(timestamp__lte=end_time)
    arch_points = list(arch_qs.order_by('timestamp', 'original_id'))

    # 3. Merge & Deduplicate
    seen_ids = set()
    combined = []

    # Active records
    for loc in active_points:
        seen_ids.add(loc.id)
        combined.append({
            'lat': float(loc.latitude),
            'lng': float(loc.longitude),
            'timestamp': loc.timestamp.isoformat(),
            'source': 'active',
            'id': loc.id,
        })

    # Archive records (copies of active records are skipped)
    for arch in arch_points:
        if arch.original_id in seen_ids:
            continue
        seen_ids.add(arch.original_id)
        combined.append({
            'lat': float(arch.latitude),
            'lng': float(arch.longitude),
            'timestamp': arch.timestamp.isoformat(),
            'source': 'archive',
            'id': arch.original_id,
        })

    # Sort combined chronologically: stable sort by (timestamp, id)
    combined.sort(key=lambda p: (p['timestamp'], p['id']))

    # Apply limit if requested
    if limit is not None and limit > 0:
        combined = combined[:limit]

    return combined
