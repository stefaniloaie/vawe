import uuid

from django.db import models


class LeaderboardEntry(models.Model):
    """A persistent, server-owned game score entry."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=20)
    streak = models.PositiveSmallIntegerField()
    rank_title = models.CharField(max_length=60, default="Ocean Navigator")
    accuracy = models.PositiveSmallIntegerField(null=True, blank=True)
    challenge_date = models.DateField(null=True, blank=True, db_index=True)
    submission_key = models.CharField(max_length=64, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-streak", "-created_at"]


class DailyChallenge(models.Model):
    """An immutable, observed NOAA snapshot used by one UTC-day Swell Duel."""

    challenge_date = models.DateField(unique=True)
    rounds = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-challenge_date"]


class DailyAttempt(models.Model):
    """Server-owned answer history for one anonymous browser and daily challenge."""

    challenge = models.ForeignKey(DailyChallenge, on_delete=models.CASCADE, related_name="attempts")
    player_key = models.CharField(max_length=64)
    answers = models.JSONField(default=list)
    score = models.PositiveSmallIntegerField(default=0)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["challenge", "player_key"], name="unique_daily_player_attempt")]
